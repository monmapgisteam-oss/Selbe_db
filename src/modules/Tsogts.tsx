'use client';

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { usePlanTotals } from '@/lib/totals';
import { Section, Note, Data, Empty, Rows, Bars, List, ListItem } from '@/components/ui';
import {
  buildPacks, PackKpi, ContractCard, BlocksCard,
  InvestCard, LayersCard, levelColor, BLOCK_LAYER, type Pack,
} from '@/modules/Bagts';
import {
  useBuildings, MonitorBagts, MonitorGeneral, MonitorDetail, useTaskPerf,
  pickedBuilding, type PickedBuilding,
} from '@/modules/BuildingPanel';
import {
  loadFinData, contractMonths, ComboChart, lagOf, lagLevel, type FinData,
} from '@/modules/Finance';
import { useAsync, type Async } from '@/lib/useAsync';
import { BUILDING, CASHFLOW2, PROGRESS_LEVELS, LAYER_BY_ID, pkgKeyOf } from '@/lib/services';
import { cat, shade, mntShort, num, pct } from '@/lib/format';
import { readParam, writeParams } from '@/lib/urlState';
import o from './overview.module.css';
import f from './finance.module.css';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import { overlapLeftParcels, type Overlap } from '@/lib/parcelOverlap';
import ts from './tsogts.module.css';

/**
 * БАРИЛГЫН ЦОГЦ ХЯНАЛТ — «Багцын мэдээлэл» + «Барилгын хяналт» + «Санхүүжилт»
 * ГУРВЫГ НЭГ дэлгэцэд нэгтгэсэн, карт бүр ЗУРГИЙГ ТОЙРСОН чөлөөт бүтэцтэй:
 *
 *   · ДЭЭР  — багц СОНГОГЧ + сонгосон багцын KPI хавтангууд
 *   · ЗҮҮН  — гэрээ/төсөв (эсвэл ХО) ба эх үүсвэрийн картууд
 *   · ТӨВ   — газрын зураг; БАРИЛГА ДАРАХАД баруун картууд тухайн барилгын
 *             хяналт болж солигдоно («‹ Багц руу буцах»)
 *   · БАРУУН— блок бүрийн гүйцэтгэл ба ажлын төрлийн задаргаа
 *   · ДООР  — санхүүгийн график БҮТЭН өргөнөөр (төлөвлөгөө·олгосон·биет + badge)
 *
 * ⚠️ ШИНЭ ЛОГИК БАРАГ БИЧЭЭГҮЙ: картууд нь Bagts-ийн, барилгын хяналт нь
 * BuildingPanel-ийн, санхүүгийн график нь Finance-ийн ЭКСПОРТ — гурван хуучин
 * харагдацын ажиллагаа өөрчлөлтгүй ЭНД дахин угсрагдана. Хуучин 3 цэс хэвээр;
 * нэгтгэл батлагдмагц устгаж болно.
 */

const HUE = LAYER_BY_ID[BLOCK_LAYER].hue;
/** Газар чөлөөлөлтийн нэгж талбарын давхарга — давхцсан талбарыг зурахад. */
const PARCEL_LAYER = 'land:left';

/** Утгыг тоо руу — ArcGIS Double эсвэл "0" мэт мөр ирдэг */
const nn = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Дундаж — бөглөгдөөгүй блокийг оруулахгүй (Bagts-ийн meanOf-той ижил дүрэм) */
const meanOf = (vals: (number | null)[]) => {
  const xs = vals.filter((v): v is number => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

export function Tsogts({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /** Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана. */
  const side = useSideResize('tsogts');
  const q = useBuildings();
  const finQ = useAsync<FinData>(loadFinData, []);
  const { zoomToWhere, setHighlight } = useMap();

  /** Сонгосон багц — Bagts-тай ижил `?pkg=` параметрээр хуваалцагдана */
  const [sel, setSel] = useState<string | null>(() => readParam('pkg'));
  /** Зураг дээр дарсан барилга — баруун картууд барилгын хяналт руу шилжинэ */
  const [pb, setPb] = useState<PickedBuilding | null>(null);
  const perfQ = useTaskPerf(pb);

  useEffect(() => { setHighlight(null); }, [setHighlight]);
  useEffect(() => { writeParams({ pkg: sel }); }, [sel]);

  const packs = useMemo<Pack[]>(
    () => buildPacks(q.state === 'ready' ? q.data.rows : null),
    [q],
  );

  const active = packs.find((p) => p.key === sel) ?? null;

  /**
   * БАГЦТАЙ ДАВХЦАЖ БУЙ «ҮЛДСЭН НЭГЖ ТАЛБАР» — чөлөөлөгдөөгүй, барилга
   * эхлүүлэхэд саад болж буй газар. Багц сонгоход орон зайн огтлолцлоор олж,
   * газрын зурагт зурж, тоог нь KPI-д гаргана.
   *
   * ⚠️ Хариу хожуу ирж БУСАД багцын үр дүнг дарж бичихээс `alive` хамгаална
   *    (хэрэглэгч хурдан дараалан сонгоход).
   */
  const [overlap, setOverlap] = useState<Overlap | null>(null);
  useEffect(() => {
    let alive = true;
    setOverlap(null);
    /* ⚠️ Багц СОНГООГҮЙ үед ч тоолно — тэгэхдээ БҮХ блокоор (`where = null`),
       өөрөөр хэлбэл төслийн НИЙТ саад. Урьд нь сонголтгүй үед огт тоолохгүй
       байсан тул хэрэглэгч «нийт хэдэн талбар саад болж байна» гэдгийг
       мэдэхийн тулд багц бүрийг ээлжлэн сонгох шаардлагатай байв. */
    /* Багц сонгосон бол ТҮҮНИЙ бүх давхарга; эс бөгөөс БҮХ БАГЦЫНХ —
       барилгын блокууд + дэд бүтцийн 48 багцын давхаргууд. Зөвхөн блокоор
       тоолвол шугам хоолой, замын коридор дээрх саад тоологдохгүй үлддэг. */
    const srcs = active
      ? active.layerIds.map((id) => ({ layerId: id, where: active.where }))
      : [
          { layerId: BLOCK_LAYER, where: null },
          ...packs.flatMap((pk) =>
            pk.kind === 'infra' ? pk.layerIds.map((id) => ({ layerId: id, where: pk.where })) : [],
          ),
        ];
    overlapLeftParcels(srcs)
      .then((r) => alive && setOverlap(r))
      .catch(() => alive && setOverlap({ oids: [] }));
    return () => {
      alive = false;
    };
  }, [active]);

  /**
   * Багц бүрийн САНХҮҮГИЙН сарын цэгүүд — CASHFLOW2-ийн мөрийг bagtsKey-ээр
   * тааруулж НЭГ УДАА бэлдэнэ. Жагсаалтын гүйцэтгэлийн хувь ба хоцрогдлын
   * alert үүнээс тооцогдоно.
   */
  const finMap = useMemo(() => {
    if (finQ.state !== 'ready') return null;
    const C = CASHFLOW2.fields;
    const m = new Map<string, ReturnType<typeof contractMonths>>();
    finQ.data.contracts.forEach((r) => {
      // ⚠️ `pkgKeyOf` — «БАГЦ 1-4» мэт ОЛОН багц хамарсан мөр нь bagtsKey-ээр
      //    «БАГЦ14» болж, бодит «Багц 14 · Дулаан хангамжийн нэвтрэх суваг»-т
      //    ХАРИЙН ТЭЗҮ гэрээ (2.23 тэрбум ₮) наалдаж, тэр багц «санхүү
      //    бүртгэлгүй» гэхийн оронд ХУДАЛ гүйцэтгэл харуулдаг байв.
      const k2 = pkgKeyOf(r[C.pkg2]);
      const k3 = pkgKeyOf(r[C.pkg]);
      [k2, k3].forEach((k) => {
        if (k && k !== '0' && !m.has(k)) m.set(k, contractMonths(r, finQ.data.given, finQ.data.phys));
      });
    });
    return m;
  }, [finQ]);

  /**
   * ALERT-тэй (төлөвлөгөөнөөс хоцорсон) багцууд — ТУСДАА бүлэг болж жагсаалтын
   * ХАМГИЙН ДЭЭР гарна. Гүйцэтгэл хэвийн болмогц lag арилж, багц өөрийн
   * бүлэгтээ аяндаа буцна (тусгай төлөв хадгалахгүй).
   */
  const alertKeys = useMemo(() => {
    const s = new Set<string>();
    if (!finMap) return s;
    packs.forEach((p) => {
      const months = finMap.get(p.key);
      if (!months) return;
      const lag = lagOf(months);
      if (lag && lagLevel(lag.gap)) s.add(p.key);
    });
    return s;
  }, [packs, finMap]);
  const alerted = useMemo(() => packs.filter((p) => alertKeys.has(p.key)), [packs, alertKeys]);

  /**
   * ДЭД БҮТЦИЙН багцууд — нэг жагсаалт. (Хөрөнгө оруулалтын «Төрөл»-өөр
   * бүлэглэдэг байсан нь INVEST /249 түр хасагдсанаар устсан; санхүүгийн
   * гүйцэтгэлийн хувь нь Cashflow /106-оос хэвээр ажиллана.)
   */
  const infraPacks = useMemo(
    () => packs.filter((p) => p.kind === 'infra'),
    [packs],
  );

  /**
   * НЭГДСЭН псевдо-багц — багц СОНГООГҮЙ үед «Блок бүрийн гүйцэтгэл» болон
   * блокийн төлөвийн картуудад бүх 113 блокийг өгнө (хоосон төлөвийн оронд
   * ТӨСЛИЙН ЕРӨНХИЙ мэдээлэл харагдана).
   */
  const allPack = useMemo<Pack | null>(() => {
    const build = packs.filter((p) => p.kind === 'build');
    if (!build.length) return null;
    const blocks = build.flatMap((p) => p.blocks);
    return {
      key: '__all',
      name: tr('Бүх багц'),
      kind: 'build',
      layerIds: [BLOCK_LAYER],
      where: null,
      blocks,
      households: build.reduce((s, p) => s + p.households, 0),
      progress: meanOf(blocks.map((b) => b.progress)),
    };
  }, [packs]);

  /**
   * ХОЦРОГДОЛТОЙ багцуудын блокийн шүүлт — багц СОНГООГҮЙ үед газрын зураг дээр
   * ЗӨВХӨН эдгээр багцын блок харагдана (анхаарал татах). Хоцрогдолгүй бол
   * (эсвэл багц сонгосон бол) энэ хэрэглэгдэхгүй.
   */
  const alertedWhere = useMemo(() => {
    const oids = alerted
      .filter((p) => p.kind === 'build')
      .flatMap((p) => p.blocks.map((b) => b.oid));
    return oids.length ? `${BUILDING.oid} IN (${oids.join(',')})` : null;
  }, [alerted]);

  /**
   * ⚠️ 2026-08-20: Багцын давхаргууд нь СУУРЬ, дээр нь каталогийн сонголт
   * (`useLayerPicks`). Урьд нь `visible` нь зөвхөн сонгосон багцаас гардаг тул
   * энэ цонхонд давхаргын каталог огт байхгүй, порталын бусад ~84 давхаргын
   * нэгийг ч контекст болгон нэмэх арга үгүй байв.
   */
  const [visible, setVisible] = useLayerPicks(active ? active.layerIds : [BLOCK_LAYER]);
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const catTotals = usePlanTotals(zone, catOpen);
  useZoomToFilter({ zone });

  /**
   * ЗУРАГТ ӨГӨХ жагсаалт — каталогийн сонголт (`visible`) дээр давхцсан
   * үлдсэн нэгж талбар олдвол газар чөлөөлөлтийн давхаргыг НЭМНЭ: инженер
   * аль блок дээр саад байгааг зурган дээр шууд харна.
   *
   * ⚠️ `setVisible` рүү БИЧИХГҮЙ — тэр нь хэрэглэгчийн каталогийн сонголт тул
   * overlap ирэх бүрд бохирдоно. Зөвхөн ГАРАЛТ дээр давхарлана.
   */
  const mapVisible = useMemo(
    () => (overlap?.oids.length ? [...new Set([...visible, PARCEL_LAYER])] : visible),
    [visible, overlap],
  );
  /**
   * ДАВХЦСАН НЭГЖ ТАЛБАРЫН ХЭВ МАЯГ — барилгын блокоос ЯЛГАРАХ ёстой.
   *
   * ⚠️ Анхны загвар нь улаавтар (`#e11d48`) бөгөөд блокууд ч улбар шар
   *    (`#ea580c`) тул ортофото дээр хоёулаа ижил төстэй харагдаж, аль нь
   *    барилга, аль нь газар болох нь ялгагдахаа больдог. Тод ягаан + зузаан
   *    хүрээ нь хоёуланг нь эрс тасалж өгнө.
   */
  /** Анивчих давхарга — давхцсан талбар олдсон үед л. */
  const parcelPulse = useMemo(
    () => (overlap?.oids.length ? [PARCEL_LAYER] : undefined),
    [overlap],
  );

  const parcelStyle = useMemo(
    () =>
      overlap?.oids.length
        ? { [PARCEL_LAYER]: { hue: '#d946ef', fill: 0.22, width: 3.4 } }
        : undefined,
    [overlap],
  );

  const layerWhere = useMemo<Record<string, string | null>>(
    // Багц сонгосон → тэр багц; эс бөгөөс → зөвхөн хоцрогдолтой багцын блокууд
    () => ({
      [BLOCK_LAYER]: active?.where ?? alertedWhere,
      // ⚠️ Давхаргад 2,119 талбар бий — ЗӨВХӨН давхцсаныг үлдээнэ, эс бөгөөс
      //    бүх хот дүүрэн парсел зурагдаж блокууд дарагдана.
      [PARCEL_LAYER]: overlap?.oids.length
        ? `OBJECTID IN (${overlap.oids.join(',')})`
        : null,
    }),
    [active, alertedWhere, overlap],
  );

  /** Багц солих — барилгын сонголт цуцлагдана (өөр багцын барилга үлдэхгүй) */
  const pick = (k: string | null) => {
    setSel(k);
    setPb(null);
    setHighlight(null);
  };

  /** Зураг дээрх барилга дарах → баруун талд тухайн барилгын хяналт */
  const onMapPick = (attrs: Record<string, unknown> | null, layerId: string | null) => {
    const b = pickedBuilding(attrs, layerId);
    if (!b) return;
    const oid = Number(attrs?.[BUILDING.oid]);
    setPb(b);
    if (Number.isFinite(oid)) setHighlight(`${BUILDING.oid} = ${oid}`, BLOCK_LAYER);
  };
  const backToPack = () => {
    setPb(null);
    setHighlight(null);
  };

  /**
   * Сонгосон багц руу нисэх.
   *
   * ⚠️ 2026-08-21 ЗАСВАР: урьд нь `zoomToWhere(id, active?.where ?? alertedWhere
   * ?? '1=1')` байсан тул ЗӨВХӨН БАРИЛГЫН багцад ажилладаг байв.
   *
   * Багц ХОЁР ТӨРӨЛТЭЙ (`buildPacks`):
   *   · `build` — давхарга нь БҮХ блокийн нэг давхарга, багцыг нь `where`
   *     (блокийн OID жагсаалт) ялгана;
   *   · `infra` — ДАВХАРГА нь өөрөө багц, тиймээс `where` нь `null`.
   *
   * `??` гинж нь дэд бүтцийн багцын `null`-ыг `alertedWhere` руу унагаадаг
   * байлаа — тэр нь БАРИЛГЫН блокийн OID-ууд. Өөр давхаргын OID-аар шүүх тул
   * үр дүн хоосон буцаж, зураг огт хөдөлдөггүй байв.
   *
   * Одоо: багц сонгосон бол `where` нь ЗӨВХӨН тухайн багцынх (байхгүй бол
   * давхарга бүхэлдээ); `alertedWhere` нь зөвхөн багц СОНГООГҮЙ үед хүчинтэй.
   */
  useEffect(() => {
    if (active) {
      const id = active.layerIds[0];
      if (id) zoomToWhere(id, active.where ?? '1=1');
      return;
    }
    zoomToWhere(BLOCK_LAYER, alertedWhere ?? '1=1');
  }, [active, alertedWhere, zoomToWhere]);

  const loading = q.state === 'loading';
  const errQ: Async<unknown> | null = q.state === 'error' ? q : null;

  return (
    /* Талын багануудыг чирж өргөсгөх/нарийсгах бариулууд. */
    <div
      ref={side.hostRef}
      className={`${ts.pack} ${side.hostClass}`}
      style={side.style}
    >
      <SplitGrip {...side.left} />
      <SplitGrip {...side.right} />
      {/* ── ДЭЭР: сонгосон багцын KPI ── */}
      <div className={ts.kpi}>
        {errQ ? null : loading ? <Empty label={tr('Ачаалж байна…')} /> : (
          <PackKpi active={active} packs={packs} />
        )}
      </div>

      {/* ── ЗҮҮН: багцын жагсаалт ── */}
      <aside className={ts.list}>
        <h2 className={o.colHead}>{tr('Багц')}</h2>
        {errQ ? (
          <Section title={tr('Багцууд')}><Data q={errQ}>{() => null}</Data></Section>
        ) : loading ? (
          <Section title={tr('Багцууд')}><Empty label={tr('Ачаалж байна…')} /></Section>
        ) : (
          <>
            {/* ⚠ ХОЦРОГДОЛТОЙ багцууд — тусдаа бүлэг, ХАМГИЙН ДЭЭР, карт бүхэлдээ анивчина */}
            {alerted.length > 0 && (
              <div className={ts.alertCard}>
                <TsPackList
                  title={tr('⚠ Хоцрогдолтой багц')}
                  note={tr('төлөвлөгөөнөөс хоцорсон')}
                  packs={alerted}
                  sel={sel}
                  onSel={pick}
                  finMap={finMap}
                />
              </div>
            )}
            <TsPackList
              title={tr('Барилга угсралт')}
              note={tr('блокийн гүйцэтгэл')}
              packs={packs.filter((p) => p.kind === 'build' && !alertKeys.has(p.key))}
              sel={sel}
              onSel={pick}
              finMap={finMap}
            />
            {/* Дэд бүтцийн багцууд — нэг жагсаалт (alert-гүй нь) */}
            <TsPackList
              title={tr('Дэд бүтэц ба нийгмийн барилга')}
              note={tr('гүйцэтгэлийн хувь')}
              packs={infraPacks.filter((p) => !alertKeys.has(p.key))}
              sel={sel}
              onSel={pick}
              finMap={finMap}
            />
            <Note>
              {tr('Багц сонгоход баруунд гэрээ/төсөв, эх үүсвэр, блок бүрийн гүйцэтгэл, доор санхүүгийн график гарна. Зураг дээрх барилга дарахад баруун талд тухайн барилгын хяналт нээгдэнэ.')}
            </Note>
          </>
        )}
      </aside>

      {/* ── ТӨВ: зураг ── */}
      <div className={ts.map}>
        <MapCanvas
          dim={dim}
          visible={mapVisible}
          opacity={opacity}
          zone={zone}
          layerWhere={layerWhere}
          layerStyle={parcelStyle}
          pulseIds={parcelPulse}
          onPick={onMapPick}
        />

        {/* ⚠️ 2026-08-20: Урьд нь ЗӨВХӨН 2D/3D/BIM байсан — Давхарга ч, Тунгалаг
            ч, Бүс ч байхгүй. Одоо бүх харагдацтай ижил нэгдсэн зурвас. */}
        <MapTools
          dim={dim}
          setDim={setDim}
          layersOpen={catOpen}
          onLayers={() => setCatOpen((v) => !v)}
          opacityOpen={opOpen}
          onOpacity={() => setOpOpen((v) => !v)}
          zone={zone}
          setZone={setZone}
        />

        {catOpen && (
          <div className={o.catPanel}>
            <LayerCatalog
              view="monitor"
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

        <div className={o.packLegend}>
          {active?.kind === 'infra'
            ? active.layerIds.map((id) => (
              <span key={id} className={o.packLegendItem}>
                <i style={{ background: LAYER_BY_ID[id].hue } as CSSProperties} />
                {LAYER_BY_ID[id].title}
              </span>
            ))
            : PROGRESS_LEVELS.map((l, i) => (
              <span key={l.key} className={o.packLegendItem}>
                <i style={{ background: shade(HUE, PROGRESS_LEVELS.length - 1 - i, PROGRESS_LEVELS.length) } as CSSProperties} />
                {l.label} <b>{l.range}</b>
              </span>
            ))}
        </div>
      </div>

      {/* ── БАРУУН нэг багана: барилга дарсан бол ХЯНАЛТ, эс бөгөөс гэрээ+эх үүсвэр ── */}
      <div className={ts.r}>
        {pb ? (
          <>
            <button type="button" className={ts.backBtn} onClick={backToPack}>
              ‹ {pb.bagts} · {pb.blok} {tr('— багц руу буцах')}
            </button>
            <MonitorGeneral b={pb} q={perfQ} />
            <MonitorDetail b={pb} q={perfQ} />
          </>
        ) : errQ ? (
          <Data q={errQ}>{() => null}</Data>
        ) : !active ? (
          /* Багц сонгоогүй — ТӨСЛИЙН НЭГДСЭН: гэрээ/төсөв · эх үүсвэр · төлөв · блок гүйцэтгэл */
          <>
            <TotalCard packs={packs} fin={finQ.state === 'ready' ? finQ.data : null} />
            {allPack && <LevelsCard blocks={allPack.blocks} />}
            {/* Блок бүрийн гүйцэтгэл — БАГЦААР нь бүлэглэсэн (нэг багц = нэг карт) */}
            {packs.filter((p) => p.kind === 'build').map((p) => (
              <BlocksCard key={p.key} p={p} title={tr('{0} — блокууд', tr(p.name))} />
            ))}
          </>
        ) : active.kind === 'build' ? (
          <>
            <ContractCard p={active} />
            <BlocksCard p={active} />
            <MonitorBagts bagts={active.name} />
          </>
        ) : (
          <>
            <InvestCard p={active} />
            <LayersCard p={active} />
          </>
        )}
      </div>

      {/* ── ДООД ГОЛ: санхүүгийн график (сонгоогүй бол ТӨСЛИЙН НЭГДСЭН) ── */}
      <div className={ts.fin}>
        <FinCard p={active} finQ={finQ} overlap={overlap} />
      </div>
    </div>
  );
}

/**
 * БАГЦЫН ЖАГСААЛТ (Tsogts хувилбар) — МӨНГӨН ДҮН БИШ, ГҮЙЦЭТГЭЛИЙН ХУВИЙГ
 * харуулж, төлөвлөгөөнөөс хоцорсон багцад ALERT (улаан/шар) өгнө:
 *   · build багц — биет гүйцэтгэлийн % (блокийн дундаж)
 *   · infra багц — санхүүгийн гүйцэтгэл % (олгосон/төлөвлөгөө, CASHFLOW2+IPC)
 * Хоцрогдол = Finance-ийн lagOf дүрэм (CF өссөн төлөвлөгөө vs биет %).
 */
function TsPackList({
  title, note, packs, sel, onSel, finMap,
}: {
  title: string;
  note: string;
  packs: Pack[];
  sel: string | null;
  onSel: (k: string | null) => void;
  finMap: Map<string, ReturnType<typeof contractMonths>> | null;
}) {
  if (!packs.length) return null;
  /**
   * ALERT-тэй багц БҮЛГИЙНХЭЭ ХАМГИЙН ДЭЭР: улаан → шар → хэвийн гэсэн
   * зэрэглэлээр, alert доторх нь хоцрогдлын хэмжээгээр (их нь эхэнд).
   * Дата шинэчлэгдэж гүйцэтгэл хэвийн болмогц lag арилдаг тул багц ААНДАА
   * хэвийн дарааллынхаа байранд буцна — тусгай төлөв хадгалахгүй.
   */
  const rows = packs
    .map((p) => {
      const months = finMap?.get(p.key) ?? null;
      const lag = months ? lagOf(months) : null;
      const lvl = lag ? lagLevel(lag.gap) : null;
      let execPct: number | null = null;
      if (p.kind === 'build') execPct = p.progress;
      else if (months) {
        const plan = months.reduce((a, m) => a + m.amount, 0);
        const given = months.reduce((a, m) => a + m.given, 0);
        execPct = plan > 0 ? (given / plan) * 100 : null;
      }
      return { p, lag, lvl, execPct };
    })
    .sort((a, b) => {
      const rank = (l: 'red' | 'yellow' | null) => (l === 'red' ? 0 : l === 'yellow' ? 1 : 2);
      return rank(a.lvl) - rank(b.lvl) || (b.lag?.gap ?? 0) - (a.lag?.gap ?? 0);
    });
  return (
    <Section title={title} note={tr('{0} багц · {1}', num(packs.length), note)}>
      <List>
        {rows.map(({ p, lag, lvl, execPct }) => {
          /**
           * ⚠️ 2026-08-18 (хэрэглэгчийн хүсэлт): багц дарахад ЖАГСААЛТЫН ДОТОР,
           * ЯГ ТЭР МӨРИЙН ДООР сарын цуваа задарна. Урьд нь сонголт зөвхөн
           * дэлгэцийн ӨӨР хэсэг дэх картуудыг сольдог байсан тул хэрэглэгч
           * жагсаалтаас нүдээ салгаж, багц хооронд харьцуулах боломжгүй байв.
           * Одоо хэд хэдэн багцыг ээлжлэн дарж, нэг байрлалд цувааг нь хардаг.
           */
          const months = finMap?.get(p.key) ?? null;
          const open = p.key === sel;
          return (
            <Fragment key={p.key}>
            <ListItem
              title={tr(p.name)}
              sub={p.kind === 'build'
                ? tr('{0} блок · {1} айл{2}', num(p.blocks.length), num(p.households), lag && lvl ? tr(' · төл. {0}% / бодит {1}%', lag.planned.toFixed(0), lag.actual.toFixed(0)) : '')
                : tr('{0}{1}', p.layerIds.length ? tr('{0} давхарга', num(p.layerIds.length)) : tr('зураггүй'), execPct != null ? '' : tr(' · санхүү бүртгэлгүй'))}
              value={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {execPct == null ? '—' : pct(execPct, 0)}
                  {/**
                    * ⚠️ 2026-08-18: анхааруулга нь ЗӨВХӨН «⚠» тэмдэг байсныг
                    * ЗӨРҮҮ + ТӨЛӨВЛӨСӨН/БОДИТ гурвалаар ил гаргав. Урьд нь тоо
                    * нь зөвхөн hover-ийн `title`-д байсан тул жагсаалтыг нүдээр
                    * гүйлгэхэд аль багц хэр хоцорсныг ХАРАХ арга байхгүй байлаа.
                    */}
                  {lvl && lag && (
                    <b
                      className={`${ts.gapBadge} ${lvl === 'red' ? ts.gapRed : ts.gapYellow}`}
                      title={tr('{0}: төлөвлөсөн {1}% · бодит {2}%', lag.month, lag.planned.toFixed(1), lag.actual.toFixed(1))}
                    >
                      <span className={lvl === 'red' ? ts.alertBlink : undefined}>⚠</span>
                      <span className="num">−{lag.gap.toFixed(1)}%</span>
                      <small className="num">
                        {lag.planned.toFixed(0)}/{lag.actual.toFixed(0)}
                      </small>
                    </b>
                  )}
                </span>
              }
              color={lvl === 'red' ? 'var(--bad)' : lvl === 'yellow' ? 'var(--warn)' : p.kind === 'build' ? levelColor(p.progress) : cat(2)}
              active={open}
              onClick={() => onSel(open ? null : p.key)}
            />
            {open && (
              <div className={ts.packExpand}>
                {months && months.length ? (
                  <>
                    <div className={ts.packLegend}>
                      <span><i style={{ background: cat(2) }} />{tr('Төлөвлөгөө')}</span>
                      <span><i style={{ background: cat(0) }} />{tr('Санхүүжилт')}</span>
                      <span><i style={{ background: cat(1) }} />{tr('Биет %')}</span>
                    </div>
                    {/* ⚠️ Намхан (140px) — жагсаалтын мөр хооронд задарч байгаа тул
                        доод бүтэн графикийн (220px) орлуулга БИШ, товч тойм. */}
                    <ComboChart items={months} height={140} lagMonth={lag?.month} lagLvl={lvl} />
                  </>
                ) : (
                  <Empty label={tr('Cashflow-д энэ багцын гэрээ бүртгэлгүй.')} />
                )}
              </div>
            )}
            </Fragment>
          );
        })}
      </List>
    </Section>
  );
}

/**
 * ТӨСЛИЙН НЭГДСЭН карт — багц сонгоогүй үеийн баруун карт.
 * (BUS_cashflow-ийн төсөв/захирамж/гэрээний мөрүүд 2026-08-13-нд хасагдсан.)
 * «Олгосон санхүүжилт» нь БОДИТ IPC актын нийлбэр (CASHFLOW2+IPC — Finance-тэй
 * нэг эх сурвалж). Дэд бүтцийн ХО (INVEST /249) 2026-08-14-нд түр хасагдсан.
 */
function TotalCard({ packs, fin }: { packs: Pack[]; fin: FinData | null }) {
  const build = packs.filter((p) => p.kind === 'build');
  const blocks = build.reduce((s, p) => s + p.blocks.length, 0);
  const households = build.reduce((s, p) => s + p.households, 0);
  // IPC-ээр олгосон нийт ₮ — багц бүрийн сар бүрийн net дүнгийн нийлбэр
  let given = 0;
  fin?.given.forEach((months) => months.forEach((v) => { given += v; }));

  /**
   * ⚠️ 2026-08-18 (хэрэглэгчийн хүсэлт): ТӨСЛИЙН ХЭМЖЭЭНИЙ төлөвлөсөн ба бодит
   * гүйцэтгэлийн хувь. Урьд нь энэ хоёр зөвхөн доод графикийн KPI зурваст л
   * байсан тул «Төсөл нийт» карт мөнгө ба блокийн тоо гэсэн хоёрхон зүйл
   * харуулж, төсөл ХЭР хоцорч байгаа нь эндээс уншигдахгүй байв.
   *
   * `aggregateMonths` нь доод графиктай ЯГ ижил нэгтгэлийг (блокоор жигнэсэн
   * биет %) буцаадаг тул хоёр газрын тоо ЗӨРӨХГҮЙ.
   */
  const totals = useMemo(() => {
    if (!fin) return null;
    const months = aggregateMonths(fin);
    const nowYm = new Date().toISOString().slice(0, 7);
    let planned: number | null = null;
    let actual: number | null = null;
    for (const m of months) {
      if (m.label > nowYm) continue;
      if (m.cumPct > 0) planned = m.cumPct;
      if (m.phys > 0) actual = m.phys;
    }
    const gap = planned != null && actual != null ? planned - actual : null;
    return { planned, actual, gap, lvl: gap == null ? null : lagLevel(gap) };
  }, [fin]);

  // ТЕКСТИЙН өнгө тул -ink хувилбар — light горимд цагаан дээр 4.5:1 хангана
  const gapTone = totals?.lvl === 'red' ? 'var(--bad-ink)'
    : totals?.lvl === 'yellow' ? 'var(--warn-ink)' : 'var(--good-ink)';

  return (
    <Section tone="primary" title={tr('Төсөл нийт')} note={tr('{0} барилгын багц', build.length)}>
      {/* Төслийн хэмжээний гүйцэтгэл — гурван нүд, доод графиктай нэг өнгө */}
      <div className={ts.totKpi}>
        <div>
          <span className={`${ts.totKpiVal} num`} style={{ color: cat(2) }}>
            {totals?.planned == null ? '…' : pct(totals.planned, 1)}
          </span>
          <span className={ts.totKpiLabel}>{tr('Төлөвлөсөн')}</span>
        </div>
        <div>
          <span className={`${ts.totKpiVal} num`} style={{ color: cat(1) }}>
            {totals?.actual == null ? '…' : pct(totals.actual, 1)}
          </span>
          <span className={ts.totKpiLabel}>{tr('Бодит гүйцэтгэл')}</span>
        </div>
        <div>
          <span className={`${ts.totKpiVal} num`} style={{ color: gapTone }}>
            {totals?.gap == null
              ? '…'
              : `${totals.gap >= 0 ? '−' : '+'}${Math.abs(totals.gap).toFixed(1)}%`}
          </span>
          <span className={ts.totKpiLabel}>{tr('Зөрүү')}</span>
        </div>
      </div>
      <Rows
        items={[
          { key: tr('Блок'), value: <span className="num">{num(blocks)}</span> },
          { key: tr('Айл өрх'), value: <span className="num">{num(households)}</span> },
          {
            key: tr('Олгосон санхүүжилт (IPC актаар)'),
            value: <span className="num">{fin ? mntShort(given) : '…'}</span>,
          },
        ]}
      />
    </Section>
  );
}

/** Блокийн ТӨЛӨВИЙН тоолол — 113 блок гүйцэтгэлийн 4 түвшнээр (сонгоогүй үед) */
function LevelsCard({ blocks }: { blocks: Pack['blocks'] }) {
  const counts = PROGRESS_LEVELS.map(() => 0);
  let noData = 0;
  blocks.forEach((b) => {
    if (b.progress == null) { noData++; return; }
    counts[Math.min(PROGRESS_LEVELS.length - 1, Math.floor(b.progress / 25))]++;
  });
  return (
    <Section title={tr('Блокийн төлөв')} note={tr('{0} блок{1}', blocks.length, noData ? tr(' · {0} мэдээлэлгүй', noData) : '')}>
      <Bars
        color={HUE}
        items={PROGRESS_LEVELS.map((l, i) => ({
          key: l.key,
          label: `${l.label} ${l.range}`,
          value: counts[i],
          color: shade(HUE, PROGRESS_LEVELS.length - 1 - i, PROGRESS_LEVELS.length),
          display: tr('{0} блок', counts[i]),
        }))}
      />
    </Section>
  );
}

/**
 * САНХҮҮГИЙН ГРАФИК — Finance-ийн ComboChart-ыг сонгосон багцад; багц
 * СОНГООГҮЙ бол ТӨСЛИЙН НЭГДСЭН (бүх гэрээний сарын нийлбэр, олгосон бүгд,
 * биет нь багцуудын дундаж). CASHFLOW2-ийн мөрийг `bagtsKey`-ээр тааруулна
 * («БАГЦ-4.1» = «Багц 4-1»); хоцрогдлын badge мөн Finance-ийн дүрмээр.
 */
function FinCard({
  p,
  finQ,
  overlap,
}: {
  p: Pack | null;
  finQ: Async<FinData>;
  /** Багцтай давхцсан үлдсэн нэгж талбар — `null` бол ачаалж байна. */
  overlap?: Overlap | null;
}) {
  const d = finQ.state === 'ready' ? finQ.data : null;
  const C = CASHFLOW2.fields;

  // Дата бэлэн бол сарын цэг, нийт дүн, хоцрогдлыг урьдчилан бодно — badge-ийг
  // гарчигт (нэрний хажууд) ба note-д (баруун талд) тавихад хэрэгтэй.
  let months: ReturnType<typeof contractMonths> | null = null;
  let total = 0;
  let noRow = false;
  if (d) {
    if (p) {
      const row =
        d.contracts.find((r) => pkgKeyOf(r[C.pkg2]) === p.key) ??
        d.contracts.find((r) => pkgKeyOf(r[C.pkg]) === p.key) ??
        null;
      if (!row) noRow = true;
      else {
        months = contractMonths(row, d.given, d.phys);
        total = nn(row[C.prevAmount]) + months.reduce((a, m) => a + m.amount, 0);
      }
    } else {
      months = aggregateMonths(d);
      total =
        d.contracts.reduce((a, r) => a + nn(r[C.prevAmount]), 0) +
        months.reduce((a, m) => a + m.amount, 0);
    }
  }
  const lag = months ? lagOf(months) : null;
  const lvl = lag ? lagLevel(lag.gap) : null;

  /**
   * KPI — Cashflow (төлөвлөсөн санхүүжилт) ба IPC (олгосон акт)-ын ₮ дүн, тэдгээрийн
   * ЗӨРҮҮ; мөн ГҮЙЦЭТГЭЛИЙН ХУВЬ хоёр (төлөвлөгөөт = Cashflow-ийн өссөн %, бодит =
   * биет гүйцэтгэл %) ба тэдгээрийн ЗӨРҮҮ. Хоёр хувийг «одоо» хүртэлх сүүлийн
   * бөглөгдсөн сараар авна — `lagOf`-той ижил дүрэм тул хоцрогдлын badge-тэй таарна.
   */
  const givenTotal = months ? months.reduce((a, m) => a + m.given, 0) : 0;
  const nowYm = new Date().toISOString().slice(0, 7);
  let plannedPct: number | null = null;
  let actualPct: number | null = null;
  if (months) {
    for (const m of months) {
      if (m.label > nowYm) continue;
      if (m.cumPct > 0) plannedPct = m.cumPct;
      if (m.phys > 0) actualPct = m.phys;
    }
  }
  // Санхүүжилтийн зөрүү — төлөвлөсөн − олгосон (₮). Эерэг = олгоогүй үлдэгдэл.
  const finGap = total - givenTotal;
  // IPC-ийн санхүүжилтийн гүйцэтгэл — олгосон ÷ төлөвлөсөн (%)
  const givenShare = total > 0 ? (givenTotal / total) * 100 : null;
  // Гүйцэтгэлийн зөрүү — төлөвлөгөөт − бодит (%). Эерэг = хоцрогдол.
  const progGap = plannedPct != null && actualPct != null ? plannedPct - actualPct : null;
  const gapLvl = progGap == null ? null : lagLevel(progGap);
  // ТЕКСТИЙН өнгө тул -ink хувилбар — light горимд цагаан дээр 4.5:1 хангана
  const gapColor = gapLvl === 'red' ? 'var(--bad-ink)' : gapLvl === 'yellow' ? 'var(--warn-ink)' : 'var(--good-ink)';
  const gapText = progGap == null ? '—' : `${progGap >= 0 ? '−' : '+'}${Math.abs(progGap).toFixed(1)}%`;

  // ГАРЧИГ — нэр + (хоцрогдол бол) нэрний ХАЖУУД alert badge
  const title = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {p ? tr(p.name) : tr('Төсөл нийт')} {tr('— санхүүжилт · төлөвлөгөө · гүйцэтгэл')}
      {lag && lvl && (
        <span
          className={`${f.lagBadge} ${lvl === 'red' ? f.lagRed : f.lagYellow}`}
          title={tr('{0}: төлөвлөсөн {1}% · бодит {2}%', lag.month, lag.planned.toFixed(1), lag.actual.toFixed(1))}
        >
          {lvl === 'red' ? tr('Хоцрогдол') : tr('Анхаарах')} −{lag.gap.toFixed(1)}%
        </span>
      )}
    </span>
  );
  // NOTE — гарчгийн БАРУУН талд «олгогдох нийт санхүүжилт» (график дээр биш)
  const note =
    total > 0 ? (
      <span className={ts.totNote}>
        {tr('Олгогдох нийт:')} <b>{num(total)} ₮</b>
      </span>
    ) : undefined;

  return (
    <Section tone="primary" title={title} note={note}>
      {finQ.state === 'loading' ? (
        <Empty label={tr('Санхүүжилтийн дата…')} />
      ) : finQ.state === 'error' ? (
        <Data q={finQ}>{() => null}</Data>
      ) : noRow ? (
        <Empty label={tr('Cashflow-д энэ багцын гэрээ бүртгэлгүй.')} />
      ) : months ? (
        <>
          <div className={ts.finKpi}>
            {[
              { v: mntShort(total), l: tr('Cashflow төлөвлөсөн'), c: cat(2) },
              {
                v: (
                  <>
                    {mntShort(givenTotal)}
                    {/**
                      * ⚠️ 2026-08-20: Хувийг ТУСДАА МӨРӨНД. Урьд нь утгын хажууд
                      * мөрлөж байсан бөгөөд `.finKpiVal` нь `nowrap` тул
                      * «314.5 тэрбум ₮ 27%» нь нүдний 1fr өргөнөөс ХАЛЬЖ, «27%»
                      * баруун хүрээн дээгүүр гарч бичигддэг байв.
                      */}
                    {givenShare != null && (
                      <small style={{ display: 'block', fontSize: '0.72em', opacity: 0.7, fontWeight: 600 }}>
                        {givenShare.toFixed(0)}%
                      </small>
                    )}
                  </>
                ),
                l: tr('IPC олгосон'),
                c: cat(0),
              },
              /* ⚠️ envhub: эерэг зөрүү нь хэвийн үлдэгдэл тул ТОГТМОЛ warn өнгө
                 нь худал дохио байв — төлөв заадаггүй утга var(--ink)-ээр. */
              { v: mntShort(finGap), l: tr('Санхүүжилтийн зөрүү'), c: 'var(--ink)' },
              { v: plannedPct == null ? '—' : pct(plannedPct, 1), l: tr('Төлөвлөгөөт гүйцэтгэл'), c: cat(2) },
              { v: actualPct == null ? '—' : pct(actualPct, 1), l: tr('Бодит гүйцэтгэл'), c: cat(1) },
              { v: gapText, l: tr('Гүйцэтгэлийн зөрүү'), c: gapColor },
              /* ДАВХЦСАН ҮЛДСЭН НЭГЖ ТАЛБАР — газар чөлөөлөгдөөгүйгээс болж
                 барилга эхлэх боломжгүй блокуудын шалтгаан. Дээд KPI-аас энд
                 зөөв: санхүүжилт/гүйцэтгэлийн хоцрогдлыг ТАЙЛБАРЛАДАГ тоо тул
                 тэдгээрийн ХАЖУУД байх нь утга учиртай.
                 ⚠️ 0 байсан ч ХАРУУЛНА — «саад алга» гэдэг нь өөрөө хариулт. */
              /* ⚠️ Багц сонгоогүй үед ч ГАРНА — тэр үед энэ нь ТӨСЛИЙН НИЙТ
                 саад (бүх блокоор). Нуувал хэрэглэгч нийт хэдэн талбар саад
                 болж байгааг мэдэхийн тулд багц бүрийг ээлжлэн сонгох болно. */
              {
                v: overlap == null ? '…' : num(overlap.oids.length),
                l: tr('давхцсан үлдсэн нэгж талбар'),
                c: overlap?.oids.length ? '#d946ef' : '#16a34a',
              },
            ].map((k) => (
              <div key={k.l}>
                <span className={`${ts.finKpiVal} num`} style={{ color: k.c }}>{k.v}</span>
                <span className={ts.finKpiLabel}>{k.l}</span>
              </div>
            ))}
          </div>
          <div className={ts.finLegend}>
            <span><i style={{ background: cat(2) }} />{tr('Төлөвлөгөө өссөн ₮')}</span>
            <span><i style={{ background: cat(0) }} />{tr('Санхүүжилт өссөн ₮')}</span>
            <span><i style={{ background: cat(1) }} />{tr('Биет гүйцэтгэл %')}</span>
          </div>
          <ComboChart items={months} height={220} lagMonth={lag?.month} lagLvl={lvl} />
        </>
      ) : null}
    </Section>
  );
}

/**
 * ТӨСЛИЙН НЭГДСЭН сарын цэгүүд: төлөвлөгөө = бүх гэрээний сарын нийлбэр,
 * олгосон = бүх багцын IPC нийлбэр, өссөн хувь = нийлбэрийн харьцаа,
 * биет = биет дататай багцуудын дундаж.
 */
function aggregateMonths(d: FinData) {
  const labels = CASHFLOW2.months;
  const planM = labels.map((m) => d.contracts.reduce((a, r) => a + nn(r[m.amount]), 0));
  const planTotal = planM.reduce((a, b) => a + b, 0);
  let cum = 0;
  return labels.map((m, i) => {
    cum += planM[i];
    let given = 0;
    d.given.forEach((byMon) => { given += byMon.get(m.label) ?? 0; });
    // ⚠️ Төслийн сарын биет гүйцэтгэл — багцуудын дунджийн ДУНДАЖ БИШ. Давхар
    //    дундаж нь блок цөөтэй багцыг том багцтай ижил жинтэй болгож гажуудуулж,
    //    мөн дэлгэц дээрх PackKpi-ийн блок-жигнэсэн дүнтэй зөрдөг. Багц бүрийг
    //    блокийнх нь тоогоор жигнэнэ: Σ(pct_p · blocks_p) / Σ blocks_p.
    let physW = 0, physN = 0;
    d.phys.forEach((byMon, k) => {
      const v = byMon.get(m.label);
      if (v == null) return;
      const w = d.physCnt.get(k)?.get(m.label) ?? 1;
      physW += v * w;
      physN += w;
    });
    return {
      label: m.label,
      amount: planM[i],
      amountCum: cum,
      cumPct: planTotal > 0 ? (cum / planTotal) * 100 : 0,
      given,
      phys: physN > 0 ? physW / physN : 0,
    };
  });
}
