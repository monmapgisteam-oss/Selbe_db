'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { Section, Col, Note, Stats, Stat, Bars, Rows, List, ListItem, Ring, Data, Empty } from '@/components/ui';
import { useBuildings, MonitorBagts, type Block } from '@/modules/BuildingPanel';
import { useAsync, type Async } from '@/lib/useAsync';
import { layerTotals, qtyText, usePlanTotals } from '@/lib/totals';
import {
  BUILDING, PROGRESS_LEVELS, LAYER_BY_ID, PKG_BY_BAGTS, bagtsKey, zoneWhere,
} from '@/lib/services';
import { mnt, num, pct, shade, tint, NO_DATA } from '@/lib/format';
import { readParam, writeParams } from '@/lib/urlState';
import { overlapLeftParcels, type Overlap } from '@/lib/parcelOverlap';
import o from './bagtsOv.module.css';

/**
 * БАГЦЫН МЭДЭЭЛЭЛ — төслийн БҮХ багц нэг хуудсанд.
 *
 * Зүүн талд багцын жагсаалт, төвд газрын зураг, баруун талд сонгосон багцын
 * дэлгэрэнгүй. Багц дарахад зураг тэр багцын объект руу нисч, бусад нь
 * шүүгдэн алга болно.
 *
 * ⚠️ ХОЁР ТӨРЛИЙН багц бөгөөд өгөгдлийн эх нь бүрмөсөн өөр:
 *   · `build` — барилга угсралтын 7 багц (Багц 1…4.2). Геометр нь
 *     `building_GOL_barigdaj_ehelsen`-ий 113 блок, мөнгө нь `BUS_cashflow`,
 *     гүйцэтгэл нь `Selbe_guitsetgel_consolidated`.
 *   · `infra` — дэд бүтцийн багц (Багц 5…21, Холбоо). Геометр нь
 *     `Selbe_ET_20260725`-ын давхаргууд. (Хөрөнгө оруулалтын дүн 2026-08-14-нд
 *     түр хасагдсан — «Хөрөнгө оруулалт өртөг /249» тодруулагдаж дахин холбоно.)
 * Барилгын багцад блокийн гүйцэтгэл, дэд бүтцийн багцад зөвхөн газрын зургийн
 * давхарга. Карт бүр өөрт хамаарахгүй бол зурагдахгүй.
 *
 * ⚠️ Гурван эх сурвалж багцын нэрийг гурван янз бичдэг («Багц 4.1» / «Багц-4.1»
 * / «Багц 4-1»), дэд бүтцийнх нь бүр «БАГЦ - 19.1», «БАГЦ -21» гэж зайтай. БҮХ
 * холбоос `bagtsKey()`-ээр — түүхий нэрээр жиших нь чимээгүй хоосон холбоос.
 */

const HUE = LAYER_BY_ID['mon:building'].hue;

/* Даралт хэрэглэдэггүй тул no-op — ГЭХДЭЭ inline () => {} бичвэл render бүрд
   шинэ лавлагаа үүсч memo(MapCanvas)-ыг эвдэж зураг дэмий дахин зурагддаг.
   Модулийн түвшний тогтмол тул үргэлж ижил. */
const noopPick = () => {};
const INFRA_HUE = '#0891b2';
/** «Тодорхойгүй / задраагүй» бүлэг — жинхэнэ ангилал мэт өнгөтэй байх ёсгүй */
const BLANK_HUE = NO_DATA;
// ⚠️ export — «Барилгын цогц хяналт» (Tsogts) мөн энэ давхаргаар ажиллана
export const BLOCK_LAYER = 'mon:building';
/** Газар чөлөөлөлтийн нэгж талбарын давхарга — давхцсан талбарыг зурахад. */
const PARCEL_LAYER = 'land:left';

/** Блокуудыг FID-ээр нэрлэн шүүх — багцын нэр давхаргад бохир бичигдсэн байж болно */
const oidWhere = (oids: number[]) =>
  oids.length ? `${BUILDING.oid} IN (${oids.join(',')})` : '1=0';

/** Дундаж — бөглөгдөөгүй блокийг ОРУУЛАХГҮЙ (0 гэж тоовол дундаж худал буурна) */
const meanOf = (vals: (number | null)[]) => {
  const xs = vals.filter((v): v is number => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

// ⚠️ export — Tsogts (цогц хяналт) ижил бүтцээр ажиллана
export type Pack = {
  /** `bagtsKey()`-ээр нормчилсон — жагсаалтын мөрийн онц */
  key: string;
  /** Дэлгэцэд гарах нэр */
  name: string;
  kind: 'build' | 'infra';
  /** Зурагт үзүүлэх давхаргын id-ууд */
  layerIds: string[];
  /** `build`: блокуудын FID шүүлт. `infra`: шүүлтгүй (давхарга нь өөрөө багц) */
  where: string | null;
  blocks: Block[];
  households: number;
  progress: number | null;
};

/**
 * Багцын нэрийг давхаргын гарчгуудын НИЙТЛЭГ угтвараас.
 *
 * ⚠️ Гараар нэрийн хүснэгт бичихгүй: гарчиг нь аль хэдийн `PKG_TABLE`-д бий.
 * «Холбоо · Багц 1 — шугам» + «Холбоо · Багц 1 — цэг» → «Холбоо · Багц 1».
 * Тусгаарлагчийн үлдэгдлийг (` · `, ` — `) арилгана, эс бөгөөс нэр тасархай
 * зураасаар төгсөнө.
 */
function commonName(titles: string[]): string {
  let p = titles[0] ?? '';
  for (const t of titles.slice(1)) {
    let i = 0;
    while (i < p.length && i < t.length && p[i] === t[i]) i += 1;
    p = p.slice(0, i);
  }
  return p.replace(/[\s·—-]+$/u, '').trim() || titles[0] || '';
}

/**
 * БАГЦУУДЫГ УГСРАХ — Bagts ба Tsogts (цогц хяналт) хоёулаа энэ ГАНЦ логикоор.
 * Цэвэр функц: эх сурвалжийн мөрүүдээс Pack[] бүтээнэ (дэлгэрэнгүй тайлбар нь
 * файлын толгойд).
 */
export function buildPacks(rows: Block[] | null): Pack[] {
  /* ── Барилга угсралтын багц — эх нь БЛОКИЙН давхарга ── */
  const build: Pack[] = [];
  if (rows) {
    const byName = new Map<string, Block[]>();
    for (const b of rows) {
      const k = b.bagts || '—';
      const arr = byName.get(k);
      if (arr) arr.push(b); else byName.set(k, [b]);
    }
    for (const [name, blocks] of byName) {
      build.push({
        key: bagtsKey(name),
        name,
        kind: 'build',
        layerIds: [BLOCK_LAYER],
        where: oidWhere(blocks.map((b) => b.oid)),
        blocks: blocks.slice().sort((a, b) => a.blok.localeCompare(b.blok, 'mn', { numeric: true })),
        households: blocks.reduce((s, b) => s + b.ail, 0),
        progress: meanOf(blocks.map((b) => b.progress)),
      });
    }
    build.sort((a, b) => a.name.localeCompare(b.name, 'mn', { numeric: true }));
  }

  /**
   * ── Дэд бүтцийн багц ──
   * ⚠️ Түлхүүрийн олонлог нь газрын зургийн ДАВХАРГА (`PKG_BY_BAGTS`). Хөрөнгө
   * оруулалтын дүн (INVEST /249) 2026-08-14-нд түр хасагдсан тул зөвхөн зурагт
   * харагдах давхаргаар багцалж, санхүүгийн үзүүлэлт үзүүлэхгүй.
   */
  const infra: Pack[] = Object.keys(PKG_BY_BAGTS).map((key) => {
    const layerIds = PKG_BY_BAGTS[key] ?? [];
    const titles = layerIds.map((id) => LAYER_BY_ID[id].title);
    return {
      key,
      name: titles.length ? commonName(titles) : key,
      kind: 'infra' as const,
      layerIds,
      where: null,
      blocks: [],
      households: 0,
      progress: null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'mn', { numeric: true }));

  return [...build, ...infra];
}

export function Bagts({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  const q = useBuildings();
  const { zoomToWhere, setHighlight } = useMap();
  /**
   * Сонгосон багц URL-ийн `pkg` параметрээс сэргэнэ — «Багц-3.1-ийн хуудсыг үз»
   * гэсэн холбоос шууд ажиллана. Түлхүүр нь `bagtsKey()` хэлбэр; таарах багц
   * олдохгүй бол (`active` null) энгийн сонголтгүй байдал — URL-аар эвдэхгүй.
   */
  const [sel, setSel] = useState<string | null>(() => readParam('pkg'));

  // Порталын нэгдсэн тодруулгыг энэ харагдац ашиглахгүй — `layerWhere`-ээр шүүнэ
  useEffect(() => { setHighlight(null); }, [setHighlight]);

  /* Сонголтыг URL-д тусгана (replace — түүх урсгахгүй) */
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
  /* ⚠️ Алдааг `{oids: []}`-оор ОРЛУУЛАХГҮЙ — «0 саад» нь ногооноор «саад алга»
     гэсэн ХАРИУЛТ болж уншигддаг тул татаж чадаагүйг жинхэнэ 0-ээс ялгаж
     `'error'` төлөвт хадгална (KPI/картад саарлаар «тоолж чадсангүй»). */
  const [overlap, setOverlap] = useState<Overlap | 'error' | null>(null);
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
      .catch(() => alive && setOverlap('error'));
    return () => {
      alive = false;
    };
  }, [active]);

  /** Амжилттай үр дүн л — зурагт/шүүлтэд алдааны төлөв «хоосон» мэт орохгүй */
  const ovOk = overlap !== 'error' ? overlap : null;

  /**
   * Сонгосон багц л зурагдана; сонголтгүй бол барилгын бүх блок.
   * ⚠️ 2026-08-20: дээр нь давхаргын каталогийн сонголт нэмэгдэнэ
   * (`useLayerPicks`) — урьд нь энэ цонхонд каталог огт байхгүй байв.
   */
  const [visible, setVisible] = useLayerPicks(active ? active.layerIds : [BLOCK_LAYER]);
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const catTotals = usePlanTotals(zone, catOpen);
  // ⚠️ Багц сонгоход нисэх нь доорх ТУСДАА эффект (өөр гох) — энэ нь БҮСЭД
  useZoomToFilter({ zone });

  /**
   * ЗУРАГТ ӨГӨХ жагсаалт — каталогийн сонголт (`visible`) дээр давхцсан
   * үлдсэн нэгж талбар олдвол газар чөлөөлөлтийн давхаргыг НЭМНЭ: инженер
   * аль блок дээр саад байгааг зурган дээр шууд харна.
   *
   * ⚠️ `visible`-д БИЧИХГҮЙ (setVisible дуудаж болохгүй) — тэр нь хэрэглэгчийн
   * каталогийн сонголт тул overlap ирэх бүрд бохирдоно. Зөвхөн ГАРАЛТ дээр
   * давхарлана.
   */
  const mapVisible = useMemo(
    () => (ovOk?.oids.length ? [...new Set([...visible, PARCEL_LAYER])] : visible),
    [visible, ovOk],
  );
  /**
   * ДАВХЦСАН НЭГЖ ТАЛБАРЫН ХЭВ МАЯГ — барилгын блокоос ЯЛГАРАХ ёстой.
   *
   * ⚠️ Анхны загвар нь улаавтар (`#e11d48`) бөгөөд блокууд ч улбар шар
   *    (`#ea580c`) тул ортофото дээр хоёулаа ижил төстэй харагдаж, аль нь
   *    барилга, аль нь газар болох нь ялгагдахаа больдог. Тод ягаан + зузаан
   *    хүрээ нь хоёуланг нь эрс тасалж өгнө.
   */
  /**
   * ⚠️ АНИВЧИЛТ ХАСАГДСАН (2026-08-28, хэрэглэгчийн заавар): пульс нь
   * талбаруудыг тасралтгүй томруулж жижигрүүлдэг тул хэлбэр, хэмжээг нь
   * нүдээр уншиж болохгүй болно. Ялгааг өнгө ба зузаан хүрээ барина.
   */

  const parcelStyle = useMemo(
    () =>
      ovOk?.oids.length
        ? { [PARCEL_LAYER]: { hue: '#d946ef', fill: 0.22, width: 1.7 } }
        : undefined,
    [ovOk],
  );

  const layerWhere = useMemo<Record<string, string | null>>(
    () => {
      /* ⚠️ `layerWhere` өгөгдмөгц MapCanvas бүсийн (zone) fallback-ийг БҮХ
         давхаргад алгасдаг (жагсаалтад БАЙХГҮЙ давхарга ч `?? null`-аар
         шүүлтгүй болдог) тул каталогоос асаасан бүсчлэлтэй давхаргууд «Бүс»
         сонгоход шүүгдэлгүй, каталогийн тоотойгоо зөрдөг байв. Тиймээс бүсийн
         шүүлтийг давхарга бүрд ЭНДЭЭС өөрсдөө тавина (noZone давхаргад
         `zoneWhere` null тул зан төрх өөрчлөгдөхгүй — тэдгээрт орон зайн маск
         хэвээр үйлчилнэ). */
      const w: Record<string, string | null> = {};
      if (zone) {
        for (const id of mapVisible) {
          const d = LAYER_BY_ID[id];
          if (d) w[id] = zoneWhere(d, zone);
        }
      }
      w[BLOCK_LAYER] = active?.where ?? null;
      // ⚠️ Давхаргад 2,119 талбар бий — ЗӨВХӨН давхцсаныг үлдээнэ, эс бөгөөс
      //    бүх хот дүүрэн парсел зурагдаж блокууд дарагдана.
      w[PARCEL_LAYER] = ovOk?.oids.length
        ? `OBJECTID IN (${ovOk.oids.join(',')})`
        : null;
      return w;
    },
    [active, ovOk, zone, mapVisible],
  );

  // Багц сонгоход түүний объект руу ниснэ; цуцлахад бүх блок руу холдоно
  useEffect(() => {
    const id = active?.layerIds[0] ?? BLOCK_LAYER;
    zoomToWhere(id, active?.where ?? '1=1');
  }, [active, zoomToWhere]);

  const loading = q.state === 'loading';
  /** Барилгын хүсэлт алдаатай бол `Data`-гийн алдааны UI (текст + «Дахин оролдох») */
  const errQ: Async<unknown> | null = q.state === 'error' ? q : null;

  return (
    <div className={o.pack}>
      <div className={o.kpi}>
        {/* ⚠️ Алдаатай үед KPI гаргахгүй — мөнгөн дүн нь худал 0 болно */}
        {!errQ && <PackKpi active={active} packs={packs} overlap={overlap} />}
      </div>

      {/* ЗҮҮН — багцын сонголт */}
      <aside className={`${o.side} ${o.left}`}>
        <h2 className={o.colHead}>{tr('Багц')}</h2>
        {errQ ? (
          <Section title={tr('Багцууд')}><Data q={errQ}>{() => null}</Data></Section>
        ) : loading ? (
          <Section title={tr('Багцууд')}><Empty label={tr('Ачаалж байна…')} /></Section>
        ) : (
          <>
            <PackList
              title={tr('Барилга угсралт')}
              note={tr('блокийн гүйцэтгэл')}
              packs={packs.filter((p) => p.kind === 'build')}
              sel={sel}
              onSel={setSel}
            />
            <PackList
              title={tr('Дэд бүтэц ба нийгмийн барилга')}
              note={tr('газрын зургийн давхарга')}
              packs={packs.filter((p) => p.kind === 'infra')}
              sel={sel}
              onSel={setSel}
            />
            <Note>
              {tr('Багц дарахад зураг тэр багцын объект руу нисч, баруун талд дэлгэрэнгүй нь гарна. Дахин дарвал бүх багц буцаж харагдана.')}
            </Note>
          </>
        )}
      </aside>

      <div className={o.map}>
        <MapCanvas
          dim={dim}
          visible={mapVisible}
          opacity={opacity}
          zone={zone}
          layerWhere={layerWhere}
          layerStyle={parcelStyle}
          onPick={noopPick}
        />

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

        {/* ⚠️ Тайлбар нь ЗУРАГТ ЮУ БАЙГААГААС хамаарна: барилгын блок нь
            гүйцэтгэлийн 4 түвшнээр өнгөтэй, дэд бүтцийн давхарга нь өөрийн
            нэг өнгөөр. Хоёуланг нь зэрэг үзүүлбэл аль нь алины тайлбар болох
            нь ойлгогдохгүй. */}
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
                {/* Легендийн өнгө нь `levelColor`-той нэг өнгөний сүүдэр */}
                <i style={{ background: shade(HUE, PROGRESS_LEVELS.length - 1 - i, PROGRESS_LEVELS.length) } as CSSProperties} />
                {l.label} <b>{l.range}</b>
              </span>
            ))}
        </div>
      </div>

      {/* БАРУУН — сонгосон багцын дэлгэрэнгүй */}
      <aside className={`${o.side} ${o.right}`}>
        <h2 className={o.colHead}>{tr('Дэлгэрэнгүй')}</h2>
        {errQ ? (
          <Data q={errQ}>{() => null}</Data>
        ) : !active ? (
          <Empty label={tr('Багц сонгоогүй байна.')} />
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
      </aside>
    </div>
  );
}

/**
 * Гүйцэтгэлийн хувь → НЭГ ӨНГӨНИЙ сүүдэр (улаан→ногоон солонго биш). Өндөр
 * гүйцэтгэл тод, бага нь бүдэг — барилгын hue дээр (хэрэглэгчийн хүсэлт).
 */
export function levelColor(v: number | null): string {
  return v == null ? BLANK_HUE : tint(HUE, v / 100);
}

/* ══════════════════ Багцын жагсаалт ══════════════════ */

export function PackList({
  title, note, packs, sel, onSel,
}: {
  title: string;
  note: string;
  packs: Pack[];
  sel: string | null;
  onSel: (k: string | null) => void;
}) {
  if (!packs.length) return null;
  return (
    <Section title={title} note={tr('{0} багц · {1}', num(packs.length), note)}>
      <List>
        {packs.map((p) => (
          <ListItem
            key={p.key}
            title={tr(p.name)}
            sub={p.kind === 'build'
              ? tr('{0} блок · {1} айл', num(p.blocks.length), num(p.households))
              : subInfra(p)}
            value={p.kind === 'build'
              ? (p.progress == null ? '—' : pct(p.progress, 0))
              : (p.layerIds.length ? tr('{0} давхарга', num(p.layerIds.length)) : '—')}
            color={p.kind === 'build' ? levelColor(p.progress) : INFRA_HUE}
            active={p.key === sel}
            onClick={() => onSel(p.key === sel ? null : p.key)}
          />
        ))}
      </List>
    </Section>
  );
}

/** Дэд бүтцийн багцын дэд мөр — газрын зургийн давхаргын тоо */
function subInfra(p: Pack): string {
  return p.layerIds.length ? tr('{0} давхарга', num(p.layerIds.length)) : tr('зураггүй');
}

/* ══════════════════ Толгойн үзүүлэлт ══════════════════ */

/**
 * Сонгосон багцын үзүүлэлт; сонголтгүй үед БҮХ багцын нэгтгэл.
 *
 * ⚠️ Гүйцэтгэлийн нийлбэр гэж байхгүй — блокоор ДУНДАЖЛАНА (бөглөгдөөгүйг
 * оруулахгүй). Багцуудын дунджийг дахин дундажлавал блок цөөтэй багц том
 * багцтай ижил жинтэй болж, төслийн явц гажина.
 */
export function PackKpi({
  active,
  packs,
  overlap,
  fin,
}: {
  active: Pack | null;
  packs: Pack[];
  /**
   * САНХҮҮГИЙН ИНДИКАТОР — өгвөл биет явцын оронд ЗӨВХӨН мөнгөний тоо гарна.
   *
   * ⚠️ «Багцын санхүү» харагдацад гүйцэтгэлийн хувь, блок, айлын тоо ГАРАХ
   *    ЁСГҮЙ — тэдгээр нь «Багцын гүйцэтгэл»-ийн хариулт. Урьд нь энэ
   *    компонент горим мэддэггүй байсан тул багц сонгомогц хоёр харагдац ЯГ
   *    ижил дөрвөн хавтан үзүүлж, нэрээрээ л ялгардаг байв.
   *
   * `undefined` = гүйцэтгэлийн горим (хуучин зан төлөв), `null` = ачаалж байна.
   */
  fin?: { plan: number; given: number } | null;
  /**
   * Багцтай давхцсан үлдсэн нэгж талбар — `null` бол хараахан ачаалж байна,
   * `'error'` бол тоолж ЧАДААГҮЙ (0-ээр орлуулбал «саад алга» гэсэн худал
   * сайн мэдээ болно).
   */
  overlap?: Overlap | 'error' | null;
}) {
  const scope = active ? [active] : packs;
  const blocks = scope.reduce((s, p) => s + p.blocks.length, 0);
  const households = scope.reduce((s, p) => s + p.households, 0);
  const progress = meanOf(scope.flatMap((p) => p.blocks.map((b) => b.progress)));
  const layers = scope.filter((p) => p.kind === 'infra').reduce((s, p) => s + p.layerIds.length, 0);

  /**
   * ДАВХЦСАН ҮЛДСЭН НЭГЖ ТАЛБАР — зөвхөн багц сонгосон үед. Тоо нь 0 байсан ч
   * ХАРУУЛНА: «саад алга» гэдэг нь өөрөө хариулт бөгөөд хоосон нүд үлдээвэл
   * хэрэглэгч ачаалж байна гэж эндүүрнэ. Ачаалж байх үед «…».
   */
  // ⚠️ Зөвхөн prop нь ӨГӨГДСӨН үед л гаргана. `undefined` (огт дамжуулаагүй)
  //    үед «…» мөнхөд харагдаж, хэрэглэгч ачаалж байна гэж эндүүрдэг байв —
  //    «Багцын хяналт»-д энэ тоо ДООД санхүүжилтийн картад зөөгдсөн.
  const blockTile = overlap !== undefined
    ? [
      overlap === 'error'
        /* Алдаа ≠ «0 саад»: ногоон хариултын оронд саарлаар ил хэлнэ */
        ? { v: '—', l: tr('давхцал тоолж чадсангүй'), c: 'var(--ink-3)' }
        : {
          v: overlap == null ? '…' : num(overlap.oids.length),
          l: tr('давхцсан үлдсэн нэгж талбар'),
          c: overlap?.oids.length ? 'var(--bad-ink)' : 'var(--good-ink)',
        },
    ]
    : [];

  if (fin !== undefined) {
    /*
     * САНХҮҮГИЙН ГОРИМ. Гэрээ бүртгэгдээгүй бол «…» БИШ «—»: цэг нь «ачаалж
     * байна» гэсэн утгатай тул мөнхөд эргэлдэж байгаа мэт харагдана.
     */
    const has = !!fin && (fin.plan > 0 || fin.given > 0);
    const share = has && fin!.plan > 0 ? (fin!.given / fin!.plan) * 100 : null;
    const finItems = [
      { v: fin == null ? '…' : has ? mnt(fin.plan) : '—', l: tr('төлөвлөгөөт санхүүжилт'), c: 'var(--data)' },
      { v: fin == null ? '…' : has ? mnt(fin.given) : '—', l: tr('олгосон санхүүжилт'), c: 'var(--good-ink)' },
      { v: fin == null ? '…' : share == null ? '—' : pct(share, 1), l: tr('олгосон хувь'), c: 'var(--data)' },
      {
        v: fin == null ? '…' : has ? mnt(Math.max(0, fin.plan - fin.given)) : '—',
        l: tr('олгогдоогүй үлдэгдэл'),
        c: 'var(--warn-ink)',
      },
    ];
    return (
      <>
        {finItems.map((i) => (
          <div key={i.l} className={o.tile} style={{ '--tone': i.c } as CSSProperties}>
            <span className={`${o.tileVal} num`}>{i.v}</span>
            <span className={o.tileLabel}>{active ? `${active.name} · ${i.l}` : i.l}</span>
          </div>
        ))}
      </>
    );
  }

  const items = active?.kind === 'infra'
    ? [
      { v: num(active.layerIds.length), l: tr('газрын зургийн давхарга'), c: INFRA_HUE },
      ...blockTile,
    ]
    : [
      { v: progress == null ? '—' : pct(progress, 1), l: tr('гүйцэтгэл'), c: levelColor(progress) },
      { v: num(blocks), l: tr('блок'), c: HUE },
      { v: num(households), l: tr('айл'), c: HUE },
      { v: num(layers), l: tr('дэд бүтцийн давхарга'), c: 'var(--data)' },
      ...blockTile,
    ];

  return (
    <>
      {items.map((i) => (
        <div key={i.l} className={o.tile} style={{ '--tone': i.c } as CSSProperties}>
          <span className={`${o.tileVal} num`}>{i.v}</span>
          <span className={o.tileLabel}>{active ? `${active.name} · ${i.l}` : i.l}</span>
        </div>
      ))}
    </>
  );
}

/* ══════════════════ Барилгын багц — гүйцэтгэл ══════════════════ */

/**
 * Багцын үндсэн карт — гүйцэтгэл, блок/айл, гүйцэтгэгч. (Гэрээ/төсөв/эх
 * үүсвэр/сарын олголтын BUS_cashflow картууд 2026-08-13-нд хасагдсан;
 * санхүүгийн бодит дүн «Цогц хяналт»-ын графикт CASHFLOW2+IPC-ээс гарна.)
 */
export function ContractCard({ p }: { p: Pack }) {
  // Гүйцэтгэгч — блокийн давхаргын BAR_COMP (багцын бүх блок нэг гүйцэтгэгчтэй)
  const contractor = p.blocks.map((b) => b.contractor).find((c) => c) ?? '—';
  return (
    <Section tone="primary" title={tr('{0} — гүйцэтгэл', p.name)}>
      <Col gap="sm">
        <div className={o.packRing}>
          <Ring value={p.progress} size={86} color={levelColor(p.progress)} label={tr('гүйцэтгэл')} />
          <Stats cols={2}>
            <Stat value={num(p.blocks.length)} unit={tr('блок')} label={tr('Блок')} color={HUE} accent />
            <Stat value={num(p.households)} unit={tr('айл')} label={tr('Айл')} color={HUE} accent />
          </Stats>
        </div>
        <Rows items={[{ key: tr('Гүйцэтгэгч'), value: contractor }]} />
      </Col>
    </Section>
  );
}

/**
 * ⚠️ Бөглөгдөөгүй блокийг ХАСАХГҮЙ, 0 гэж ч зурахгүй: «мэдээлэлгүй» гэж бичнэ.
 * 0%-иар зурвал тайлан ирээгүй блок нь ажил эхлээгүйтэй андуурагдана.
 */
export function BlocksCard({
  p,
  title = tr('Блок бүрийн гүйцэтгэл'),
  collapsible,
  defaultOpen,
  overlapN,
  overlapOids,
  onOverlapPick,
}: {
  p: Pack;
  title?: string;
  /**
   * Хураагддаг карт — АНХДАГЧ нь ХААЛТТАЙ бөгөөд refresh хийхэд ч хаалттай
   * эхэлнэ (2026-08-21: «үзье гэсэн нь нээж харна»).
   */
  collapsible?: boolean;
  /** `collapsible` үед энэ карт АНХНААСАА НЭЭЛТТЭЙ эхэлнэ (бусад нь хаалттай) */
  defaultOpen?: boolean;
  /**
   * Багцын ДАВХЦСАН ҮЛДСЭН НЭГЖ ТАЛБАРЫН тоо — өгвөл нээхэд блокуудын ДЭЭР
   * гарна (`null` = ачаалж байна, `'error'` = тоолж чадаагүй — 0-оор
   * орлуулбал «саад алга» гэсэн худал сайн мэдээ болно). FinCard-ын нэгдсэн
   * индикаторыг багцаар задалж энд зөөв (2026-08-21).
   */
  overlapN?: number | 'error' | null;
  /**
   * Давхцсан нэгж талбаруудын ObjectID — өгвөл зурвас ДАРАГДАХ болно:
   * дарахад газрын зураг тэдгээр талбар руу ойртож, тодруулна.
   *
   * ⚠️ Зөвхөн ТОО хангалтгүй байв: «1 талбар саад болж байна» гэдгийг уншсан
   *    инженер тэр талбарыг ОЛОХЫН тулд зургийг гараар гүйлгэх шаардлагатай
   *    байлаа. Давхарга дээр аль хэдийн улаанаар зурагдаж байгаа тул очих зам
   *    л дутуу байсан.
   */
  overlapOids?: number[];
  /**
   * Зурвасын сонголтыг ЭЦЭГТ мэдэгдэнэ (сонгосон OID-ууд, эс бөгөөс `null`).
   *
   * ⚠️ ЗААВАЛ ЭЦЭГТ: газрын зургийн парселийн давхаргын шүүлт
   *    (`layerWhere`) нь эцэгт бодогддог. Зөвхөн энд `zoomToWhere` дуудвал
   *    зураг тэр талбар руу ойртоно ГЭХДЭЭ давхарга дээр ТӨСЛИЙН БҮХ
   *    давхцсан талбар зурагдсан хэвээр үлдэнэ — хэрэглэгч аль нь тухайн
   *    багцынх болохыг ялгаж чадахгүй (2026-08-27-нд сүлжээний хүсэлтээр
   *    баталсан: `OBJECTID IN (1821,814,1361,…)` бүтэн жагсаалт явж байв).
   */
  onOverlapPick?: (oids: number[] | null) => void;
}) {
  const withData = p.blocks.filter((b) => b.progress != null).length;
  const { zoomToWhere, setHighlight } = useMap();
  /** Сонгосон блок — дарахад зурагт тодруулж ойртоно, дахин дарахад болино */
  const [selOid, setSelOid] = useState<string | null>(null);
  /**
   * ⚠️ Тодруулга ХОЦРОХООС сэргийлнэ (ViewPanel §LayerDashboard-ын загвар).
   * Блок тодруулсан хэвээр багц солиход/карт unmount болоход хуучин OID-той
   * featureEffect зурган дээр үлдэж, шинэ багцын шүүлтэд тэр OID байхгүй тул
   * БҮХ блок бүдгэрч, цуцлах удирдлага ч гарахгүй байв. Cleanup нь ЗӨВХӨН
   * өөрийн тавьсан тодруулгыг арилгана (ref-ээр шалгана) — эс бөгөөс Tsogts-д
   * зураг дээрх барилга-даралтын тодруулгыг дайрч цэвэрлэнэ.
   */
  const selRef = useRef(selOid);
  selRef.current = selOid;
  const releaseRef = useRef(onOverlapPick);
  releaseRef.current = onOverlapPick;
  useEffect(() => () => {
    if (selRef.current != null) setHighlight(null);
    // ⚠️ Карт алга болоход парселийн нарийсгалт ҮЛДВЭЛ өөр багц руу
    //    шилжсэн хэрэглэгч хоосон зураг хараад шалтгааныг нь олохгүй.
    releaseRef.current?.(null);
  }, [setHighlight]);
  const prevPackRef = useRef(p.key);
  useEffect(() => {
    if (prevPackRef.current === p.key) return;
    prevPackRef.current = p.key;
    if (selRef.current != null) {
      setSelOid(null);
      setHighlight(null);
      onOverlapPick?.(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.key, setHighlight]);
  const pick = (key: string) => {
    const off = selOid === key;
    setSelOid(off ? null : key);
    // ⚠️ Блок сонгоход парселийн нарийсгалтыг тавина — эс бөгөөс зураг
    //    хуучин нэг талбар дээр түгжээтэй үлдэж, сонгосон блок харагдахгүй.
    onOverlapPick?.(null);
    if (off) { setHighlight(null); return; }
    const w = `${BUILDING.oid} = ${Number(key)}`;
    setHighlight(w, BLOCK_LAYER);
    zoomToWhere(BLOCK_LAYER, w);
  };

  /**
   * ДАВХЦСАН ТАЛБАР РУУ ОЧИХ — зурвас дээр дарахад.
   *
   * ⚠️ Блокийн сонголттой НЭГ төлөв хуваалцана (`selOid`): хоёулаа
   *    `setHighlight`-д бичдэг тул тусад нь хөтөлбөл нэг нь нөгөөгийнхөө
   *    тодруулгыг чимээгүй дарж, аль нь идэвхтэй болох нь мэдэгдэхгүй болно.
   *    Түлхүүр нь OID биш тул блокийн дугаартай хэзээ ч давхцахгүй.
   */
  const OV_KEY = 'overlap';
  const ovOn = selOid === OV_KEY;
  const ovGo = overlapOids?.length
    ? () => {
      /* ⚠️ Тодруулга (`setHighlight`) БИШ, ШҮҮЛТ. Тодруулга нь таарахгүйг
         БҮДГЭРҮҮЛДЭГ — 100 гаруй давхцсан талбарын дунд бүдгэрсэн 99 нь
         зурагдсан хэвээр байж, сонгосон нэг нь тэдний дунд алга болно.
         Эцгийн `layerWhere` нь тэднийг БҮРМӨСӨН хасна. */
      setHighlight(null);
      if (ovOn) { setSelOid(null); onOverlapPick?.(null); return; }
      setSelOid(OV_KEY);
      onOverlapPick?.(overlapOids);
      /* ⚠️ Анимацигүй — [[Gazar]]-тай ижил шалтгаанаар */
      zoomToWhere(PARCEL_LAYER, `OBJECTID IN (${overlapOids.join(',')})`, { animate: false });
    }
    : null;
  /**
   * ТОЛГОЙН БАРУУН ГАРЫН ТЭМДЭГЛЭЛ.
   *
   * ⚠️ 2026-08-23 (хэрэглэгчийн хүсэлт): «20/20 бүртгэлтэй» гэсэн блокийн
   * тооллогын ОРОНД ДАВХЦСАН ҮЛДСЭН НЭГЖ ТАЛБАРЫН тоо. Багцын картууд
   * АНХНААСАА ХААЛТТАЙ эхэлдэг тул саадын тоо урьд нь картыг нээж үзсэн хүнд
   * л харагддаг байв — одоо жагсаалтыг гүйлгэхэд багц БҮРИЙНХ шууд уншигдана.
   *
   * ⚠️ `overlapN` өгөөгүй үед (сонгосон багцын дотоод карт) хуучин тооллого
   * ХЭВЭЭР: тэнд давхцлын тоо картын дотор аль хэдийн байдаг тул толгойд
   * давхардуулах шаардлагагүй.
   *
   * ⚠️ Өнгө нь УЛААН (`--bad-ink`), ягаан (`--overlap`) БИШ — хэрэглэгчийн
   * шийдвэр. Тэг үед ногоон: саадгүй нь сайн мэдээ.
   */
  const note = overlapN === undefined
    ? tr('{0}/{1} бүртгэлтэй', num(withData), num(p.blocks.length))
    : overlapN == null
      ? tr('давхцал тоолж байна…')
      : overlapN === 'error'
        /* Алдаа ≠ «0 давхцсан» — ногоон сайн мэдээний оронд саарлаар ил хэлнэ */
        ? <span style={{ color: 'var(--ink-3)' }}>{tr('давхцал тоолж чадсангүй')}</span>
        : (
          <span style={{ color: overlapN ? 'var(--bad-ink)' : 'var(--good-ink)' }}>
            {tr('{0} давхцсан талбар', num(overlapN))}
          </span>
        );

  return (
    <Section title={title} collapsible={collapsible} defaultClosed={collapsible && !defaultOpen} note={note}>
      {overlapN !== undefined && (
        <>
          {/* ДАВХЦЛЫН мэдээлэл — хайрцаглаж, доорх блокийн жагсаалтаас
              нүдээр илт зааглана. Тоо >0 бол шар аяс — ажилд саад буй.
              ⚠️ Талбарууд мэдэгдэж байвал ДАРЖ тэдгээр рүү очно. Тэг эсвэл
                 алдааны үед энгийн `div` — дарах юм байхгүй бол товч мэт
                 харагдах нь худал амлалт. */}
          {ovGo ? (
            <button
              type="button"
              className={`${o.ovStrip} ${o.ovStripOn} ${o.ovStripBtn} ${ovOn ? o.ovStripSel : ''}`}
              onClick={ovGo}
              title={tr('Дарж газрын зураг дээрх давхцсан нэгж талбар руу очно')}
            >
              <span>{tr('Давхцсан үлдсэн нэгж талбар')}</span>
              <b className="num">{num(overlapN as number)}</b>
            </button>
          ) : (
            <div className={`${o.ovStrip} ${typeof overlapN === 'number' && overlapN ? o.ovStripOn : ''}`}>
              <span>{overlapN === 'error' ? tr('Давхцал тоолж чадсангүй') : tr('Давхцсан үлдсэн нэгж талбар')}</span>
              <b className="num">{overlapN == null ? '…' : overlapN === 'error' ? '—' : num(overlapN)}</b>
            </div>
          )}
          {/* Жагсаалтын карт («Багц N — блокууд») дээр доорх мөрүүд ЮУ болохыг
              нэрлэнэ; сонгосон багцын картад гарчиг нь өөрөө хэлдэг тул хэрэггүй */}
          {collapsible && <div className={o.ovDivider}>{tr('Блок бүрийн гүйцэтгэл')}</div>}
        </>
      )}
      <Bars
        color={HUE}
        max={100}
        inline
        selected={selOid}
        onSelect={pick}
        items={p.blocks.map((b) => ({
          // ⚠️ `b.key` (buildingKey) БИШ: Багц 1-д хоёр блок «29/1» болж хураагдан
          //    давхардаж, React мөр орхигдуулж болно. OID нь үргэлж өвөрмөц.
          key: String(b.oid),
          label: b.blok || '—',
          value: b.progress ?? 0,
          color: levelColor(b.progress),
          display: b.progress == null
            ? tr('мэдээлэлгүй')
            : tr('{0}{1}', pct(b.progress, 0), b.floors ? tr(' · {0} давхар', b.floors) : ''),
        }))}
      />
    </Section>
  );
}

/* ══════════════════ Дэд бүтцийн багц ══════════════════ */

/**
 * Дэд бүтцийн багцын толгойн карт. Хөрөнгө оруулалтын дүн («Хөрөнгө оруулалт
 * өртөг /249») 2026-08-14-нд түр хасагдсан тул одоогоор зөвхөн газрын зургийн
 * давхаргууд харагдана — доор `LayersCard` тэдгээрийн тоо, хэмжээг үзүүлнэ.
 */
export function InvestCard({ p }: { p: Pack }) {
  return (
    <Section tone="primary" title={tr(p.name)}>
      <Note>
        {tr('Энэ багцын хөрөнгө оруулалтын дүн түр хасагдсан. Зурагт харагдах давхаргууд доор жагсаав; санхүүжилтийн үзүүлэлт эх өгөгдөл тодруулагдсаны дараа нэмэгдэнэ.')}
      </Note>
    </Section>
  );
}

/**
 * Багцын давхаргууд — объектын тоо ба хэмжээ.
 *
 * ⚠️ Хэмжээ нь `Shape__Length`/`Shape__Area`-аас (үйлчилгээ UTM 48N тул бодит
 * метр). CAD-ийн `Length_km`/`Area_m2` талбар зарим давхаргад хоосон тул
 * тэдгээрийг эх болговол хэмжээ чимээгүй 0 болно.
 */
export function LayersCard({ p }: { p: Pack }) {
  const q = usePkgTotals(p.layerIds);
  if (!p.layerIds.length) {
    return (
      <Section title={tr('Давхарга')}>
        <Note>{tr('Энэ багцад газрын зургийн давхарга алга — зөвхөн төсвийн мөр бүртгэгдсэн.')}</Note>
      </Section>
    );
  }
  return (
    <Section title={tr('Давхарга ба хэмжээ')} note={tr('{0} давхарга', num(p.layerIds.length))}>
      <Data q={q} loading={tr('Хэмжээ тооцож байна…')}>
        {(rows) => (
          <Rows
            items={rows.map((r) => ({
              key: r.title,
              value: <span className="num">{[tr('{0} ш', num(r.n)), r.qty].filter(Boolean).join(' · ')}</span>,
            }))}
          />
        )}
      </Data>
    </Section>
  );
}

/* Давхарга бүрийн нийлбэрийн сесс-кэш (2026-08-21 гүйцэтгэлийн аудит):
   нэг багцыг дахин сонгоход ижил stat-асуулгууд дахин явдаг байв. Дүн нь
   сессийн турш тогтвортой; амжилтгүйг кэшлэхгүй. */
const pkgTotalCache = new Map<string, Promise<{ title: string; n: number; qty: string | null }>>();

/** Сонгосон багцын давхарга бүрийн тоо ба хэмжээ — сонголт солигдох бүрд */
function usePkgTotals(ids: string[]): Async<{ title: string; n: number; qty: string | null }[]> {
  const key = ids.join(',');
  return useAsync(async () => {
    if (!ids.length) return [];
    return Promise.all(ids.map((id) => {
      let p = pkgTotalCache.get(id);
      if (!p) {
        const d = LAYER_BY_ID[id];
        p = layerTotals(d, '1=1').then((t) => ({ title: d.title, n: t.n, qty: qtyText(d, t.q) }));
        p.catch(() => pkgTotalCache.delete(id));
        pkgTotalCache.set(id, p);
      }
      return p;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
