'use client';

import { useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { Section, Stats, Stat, Bars, Donut, Rows, Data, Empty } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { LayerSwatch } from '@/components/LayerSwatch';
import { useMap } from '@/components/MapCanvas';
import { useAsync, type Async } from '@/lib/useAsync';
import { queryGroup, count, sum, groups, groupWhere, sqlStr, type Row } from '@/lib/query';
import {
  LAYER_BY_ID, layerUrl, OID, ZONE_FIELD, ZONE_NONE, ZONE_LAYER, ZONE_FIELDS,
  BUILT_LAYER, BUILT_FIELDS, BUILT_STATUS, ZONE_TYPES, ZONE_TYPE_EMPTY_HUE,
  LAYER_GROUPS, GROUP_LAYERS, PLAN_LAYER_IDS, groupOf, VIEW_BY_KEY,
  type LayerDef, type ViewKey,
} from '@/lib/services';
import { whereFor, qtyText, geomText, layerStats, type Totals } from '@/lib/totals';
import { num, text } from '@/lib/format';
import { BuildingSummary, BuildingWork } from './BuildingPanel';
import { SurveySummary, useSurvey, useOutside } from './SurveyPanel';
import s from './dashboard.module.css';

/** Ангиллын дугуй диаграмд өнгө оноох палитр (paint тодорхойлолтгүй давхаргад) */
const PALETTE = ['#0d9488', '#3387b8', '#ea580c', '#7c3aed', '#eab308', '#22c55e', '#e11d48', '#0891b2'];

/* ═════════════════ Үндсэн самбар ═════════════════ */

/**
 * ⚠️ Тоо, өртгийг ЭНД татахгүй — `Portal` нэг удаа татаж `totals`-оор өгнө.
 * Каталогийн багана ба энэ самбар ижил тоо харуулах ёстой.
 */
export function ViewPanel({
  view,
  totals,
  visible,
  setVisible,
  zone,
  setZone,
  picked,
  pickedLayer,
  openCatalog,
  layer,
  setLayer,
}: {
  view: ViewKey;
  totals: Async<Map<string, Totals>>;
  visible: string[];
  setVisible: Dispatch<SetStateAction<string[]>>;
  zone: string | null;
  setZone: (z: string | null) => void;
  picked: Record<string, unknown> | null;
  pickedLayer: string | null;
  openCatalog: () => void;
  layer: string | null;
  setLayer: (id: string | null) => void;
}) {
  // ⚠️ Барилгын хяналт нь бэспок самбартай (16 үе шат, тайлангийн хүснэгтүүд).
  //    ТУСДАА компонент — эс бөгөөс түүний дотоод hook-ууд нөхцөлт дуудагдана.
  // ⚠️ «Анализ» энд ОГТ ирэхгүй: тэр харагдац нь `Portal` дээр өөрийн бүрэн
  //    дэлгэцээр (Suitability) зурагддаг тул самбар байхгүй.
  if (view === 'monitor') {
    return <MonitorPanel picked={picked} pickedLayer={pickedLayer} />;
  }

  const def = layer ? LAYER_BY_ID[layer] : null;

  return (
    <>
      <ZoneBar zone={zone} setZone={setZone} />

      {/* Дарсан объект — ХАМГИЙН ДЭЭР. Зураг дээр дарсан хариу шууд нүдэнд өртөнө. */}
      {picked && pickedLayer && (
        pickedLayer === ZONE_LAYER.id
          ? <PickedZone attrs={picked} zone={zone} setZone={setZone} />
          : LAYER_BY_ID[pickedLayer]
            ? (
              <PickedFeature
                attrs={picked}
                def={LAYER_BY_ID[pickedLayer]}
                setZone={setZone}
                isolated={visible.length === 1 && visible[0] === pickedLayer}
                onIsolate={() =>
                  setVisible((prev) =>
                    prev.length === 1 && prev[0] === pickedLayer
                      ? PLAN_LAYER_IDS.slice()
                      : [pickedLayer],
                  )
                }
              />
            )
            : null
      )}

      {def ? (
        <LayerDashboard
          d={def}
          totals={totals}
          zone={zone}
          on={visible.includes(def.id)}
          toggle={() =>
            setVisible((prev) =>
              prev.includes(def.id) ? prev.filter((x) => x !== def.id) : [...prev, def.id],
            )
          }
          onBack={() => { setLayer(null); openCatalog(); }}
        />
      ) : (
        <PlanOverview
          totals={totals}
          zone={zone}
          visible={visible}
          setVisible={setVisible}
          setLayer={setLayer}
        />
      )}
    </>
  );
}

/* ═════════════════ Тойм — сонгосон давхаргууд, геометрийн төрлөөр ═════════════════ */

/**
 * ГЕОМЕТРИЙН ТӨРӨЛ бүрийн хэмжигдэхүүн.
 *
 * ⚠️ Талбай, урт, ширхэг гурвыг НЭГ график дээр нэмж болохгүй: «26.7 га» ба
 * «65.3 км»-ийн нийлбэр утгагүй, харин «654 худаг»-ийг метрээр хэмжих аргагүй.
 * Тиймээс төрөл бүр өөрийн график, өөрийн нэгжтэй.
 */
const GEOM_CHARTS = [
  {
    geom: 'area' as const,
    title: 'Талбайн давхарга',
    /** Индикаторын богино шошго — «Талбай 157.2 га» */
    short: 'Талбай',
    note: 'га',
    /** м² → га */
    value: (d: LayerDef, t: Totals) => (d.qty ? t.q / 10_000 : 0),
    display: (v: number, t: Totals) => `${num(v, 1)} га · ${num(t.n)}`,
  },
  {
    geom: 'line' as const,
    title: 'Шугаман давхарга',
    short: 'Урт',
    note: 'км',
    /** «м» → км; «км» нэгжтэй давхарга шууд */
    value: (d: LayerDef, t: Totals) => (!d.qty ? 0 : d.qty.unit === 'км' ? t.q : t.q / 1_000),
    display: (v: number, t: Totals) => `${num(v, 1)} км · ${num(t.n)}`,
  },
  {
    geom: 'point' as const,
    title: 'Цэгэн давхарга',
    short: 'Цэг',
    note: 'ширхэг',
    /** Цэгт хэмжээ гэж байхгүй — тоо нь өөрөө хэмжигдэхүүн */
    value: (_d: LayerDef, t: Totals) => t.n,
    display: (v: number) => `${num(v)}`,
  },
  /**
   * ⚠️ ХЭМЖЭЭГҮЙ талбай/шугам. Зарим давхарга (жишээ нь «Зам (талбай)» —
   * 1,651 объект) зөвхөн ГЕОМЕТРТЭЙ, атрибутгүй тул урт/талбайг нь тооцох
   * боломжгүй. Эдгээрийг га/км-ийн графикт оруулбал утга нь 0 болж чимээгүй
   * УНАНА — чеклэсэн давхарга самбарт огт харагдахгүй. Тиймээс өөрийн
   * хэсэгтэй: хэмжээг нь мэдэхгүй ч тоо нь мэдэгдэнэ.
   */
  {
    geom: 'other' as const,
    title: 'Хэмжээ бүртгэгдээгүй',
    short: 'Хэмжээгүй',
    note: 'ширхэг',
    value: (_d: LayerDef, t: Totals) => t.n,
    display: (v: number) => `${num(v)}`,
  },
];

/**
 * Давхарга аль графикт орох вэ.
 *
 * Цэг → үргэлж «цэгэн». Талбай/шугам нь ХЭМЖЭЭТЭЙ бол өөрийн нэгжийн графикт,
 * хэмжээгүй бол «бүртгэгдээгүй» рүү — аль нэгэнд нь ЗААВАЛ орно.
 */
const chartOf = (d: LayerDef, t: Totals): 'area' | 'line' | 'point' | 'other' =>
  d.geom === 'point' ? 'point'
    : d.qty && t.q > 0 ? d.geom
      : 'other';

/**
 * БАГЦЫН нэгдсэн хэмжигдэхүүн — картанд харуулах утгууд.
 *
 * ⚠️ Урт, талбай, цэг ГУРВЫГ ТУСАД нь хураана. Багц дотор шугам ба талбай
 * хольцтой байдаг («Зам»-д 98.2 км тэнхлэг ба 26.7 га явган зам хоёул) тул
 * нэг тоо болгож нэмбэл утгагүй дүн гарна.
 */
function cardStats(ids: string[], map: ReadonlyMap<string, Totals>) {
  let km = 0, ha = 0, pts = 0, n = 0;
  for (const id of ids) {
    const d = LAYER_BY_ID[id];
    const t = map.get(id);
    if (!d || !t) continue;
    n += t.n;
    if (d.geom === 'point') { pts += t.n; continue; }
    if (!d.qty || t.q <= 0) continue;
    if (d.qty.unit === 'км') km += t.q;
    else if (d.qty.unit === 'м') km += t.q / 1_000;
    else ha += t.q / 10_000;
  }
  return { layers: ids.length, n, km, ha, pts };
}

/** Багцын карт — тойм ба сонголтын аль алинд ижил хэлбэр */
function GroupCard({
  g, ids, map, on, wide, onClick, children,
}: {
  g: (typeof LAYER_GROUPS)[number];
  ids: string[];
  map: ReadonlyMap<string, Totals>;
  on?: boolean;
  /** Цөөн карттай үед — бүтэн өргөн, том фонт */
  wide?: boolean;
  onClick?: () => void;
  /**
   * Багцын БҮХ агуулга — донат, чартууд, тайлбар. Өгвөл карт нь тоймын
   * хайрцаг биш, БҮРЭН хэсэг болно.
   *
   * ⚠️ Урьд нь карт нь зөвхөн гурван тоо харуулж, чартууд нь доор ТУСДАА
   * хэсгүүд болж гардаг байв — 4 багц сонговол картууд дээр, чартууд нь
   * хэдэн дэлгэц доор тарж, аль чарт аль багцынх болох нь тодорхойгүй
   * болдог байлаа. Одоо багц бүр өөрийн хайрцагтай.
   */
  children?: React.ReactNode;
}) {
  const x = cardStats(ids, map);
  const rows: { v: string; k: string }[] = [];
  if (x.km > 0) rows.push({ v: num(x.km, 1), k: 'км' });
  if (x.ha > 0) rows.push({ v: num(x.ha, 1), k: 'га' });
  if (x.pts > 0) rows.push({ v: num(x.pts), k: 'цэг' });

  const body = (
    <>
      <span className={s.cardHead}>
        <span className={s.cardIcon}><Icon name={g.icon} size={13} /></span>
        <span className={s.cardTitle}>{g.title}</span>
      </span>
      <span className={s.cardStats}>
        <span className={s.cardStat}>
          <span className={`${s.cardVal} num`}>{num(x.layers)}</span>
          <span className={s.cardKey}>төрөл</span>
        </span>
        {rows.map((r) => (
          <span key={r.k} className={s.cardStat}>
            <span className={`${s.cardVal} num`}>{r.v}</span>
            <span className={s.cardKey}>{r.k}</span>
          </span>
        ))}
        {/* ⚠️ Хэмжээгүй багц ч гэсэн хоосон харагдаж болохгүй — тоогоо өгнө */}
        {!rows.length && (
          <span className={s.cardStat}>
            <span className={`${s.cardVal} num`}>{num(x.n)}</span>
            <span className={s.cardKey}>объект</span>
          </span>
        )}
      </span>
    </>
  );

  const cls = `${s.card} ${wide ? s.cardWide : ''} ${on ? s.cardOn : ''} ${children ? s.cardFull : ''}`;
  const st = { '--tone': g.hue } as CSSProperties;

  // ⚠️ Агуулгатай карт нь <div>: <button> дотор чарт, товч байрлуулж болохгүй
  if (children) {
    return <div className={cls} style={st}>{body}<div className={s.cardBody}>{children}</div></div>;
  }
  return onClick ? (
    <button type="button" aria-pressed={!!on} className={cls} style={st} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls} style={st}>{body}</div>
  );
}

/**
 * Картын сүлжээ — картын тооноос хамаарч баганын ДООД өргөнийг тохируулна.
 *
 *   · 1 карт      → `100%`  — бүтэн өргөн
 *   · 2+ карт     → `260px` — самбар зөвшөөрвөл 2 багана, эс бөгөөс дараална
 *   · тойм (10)   → `210px` — 360px самбарт НЭГ багана: 10 карт доошоо
 *                             дараалж, тус бүр нь бүтэн өргөн, том фонттой.
 *                             Самбарыг өргөсгөвөл 2–3 багана болно.
 *
 * ⚠️ Тогтмол `repeat(2, 1fr)` БИШ: самбар 300px хүртэл нарийсдаг бөгөөд тэнд
 * хоёр багана нь 140px тус бүр болж, дотор нь донат ба тайлбар багтахгүй.
 * `auto-fit` + доод хязгаар нь өргөн байвал 2 багана, нарийн бол 1 багана
 * болгож ӨӨРӨӨ шийднэ — самбарын баруун ирмэгийг чирж өргөсгөнө үү.
 */
const CARD_WIDE_MAX = 1;
const gridStyle = (n: number, compact = false) =>
  ({ '--card-min': compact ? '210px' : n <= CARD_WIDE_MAX ? '100%' : '260px' }) as CSSProperties;

/**
 * ТОЙМ — ХОЁР ГОРИМ, солигдоно.
 *
 *   · Сонголт ХИЙГЭЭГҮЙ → «ерөнхий» горим: 29 давхаргын багцчилсан зураг
 *     (нийт үзүүлэлт, багцаар эзлэх хувь, багцын хэмжээ).
 *   · Сонголт ХИЙСЭН   → «сонголтын» горим: зөвхөн сонгосон багц/давхаргын
 *     чартууд. Ерөнхий чартууд алга болно.
 *
 * ⚠️ «Сонголт хийгээгүй» гэдгийг `visible.length === 0` гэж ҮЗЭХГҮЙ: апп
 * нээгдэхэд бүсийн давхарга анхдагчаар асаалттай байдаг (эс бөгөөс зураг
 * хоосон нээгдэнэ). Тиймээс АНХДАГЧ багцтай ЯГ тэнцүү байхыг «хараахан
 * сонгоогүй» гэж үзнэ — ингэснээр эхний харагдац ерөнхий чартуудтай, зураг нь
 * бүсээ харуулсан хэвээр байна.
 */
function PlanOverview({
  totals,
  zone,
  visible,
  setVisible,
  setLayer,
}: {
  totals: Async<Map<string, Totals>>;
  zone: string | null;
  visible: string[];
  setVisible: Dispatch<SetStateAction<string[]>>;
  setLayer: (id: string | null) => void;
}) {
  return (
    <Data q={totals} loading="Үзүүлэлт тооцож байна…">
      {(map) => {
        /**
         * ⚠️ Бүс сонгогдсон үед `ZONE_ID`-гүй давхаргыг нийлбэрээс ХАСНА —
         * тэдгээр нь бүсээр шүүгдэх боломжгүй тул төслийн бүх утгаа хэвээр өгнө.
         * Нийлбэрт оруулбал бүсийн дүн бүхэлдээ худал болно.
         */
        const counted = PLAN_LAYER_IDS.filter((id) => !(zone && LAYER_BY_ID[id]?.noZone));
        const allN = counted.reduce((a, id) => a + (map.get(id)?.n ?? 0), 0);

        const on = counted.filter((id) => visible.includes(id));
        const totalN = on.reduce((a, id) => a + (map.get(id)?.n ?? 0), 0);

        /**
         * Хэрэглэгч хараахан сонголт хийгээгүй эсэх — анхдагч багцтай ЯГ тэнцүү.
         * ⚠️ `visible`-ыг харна (`on` биш): `on` нь бүсийн шүүлтэд давхарга
         * хасагдвал богиносох тул «сонгоогүй» гэж худал уншигдана.
         */
        const initial = VIEW_BY_KEY.plan.initial;
        const untouched =
          visible.length === initial.length && initial.every((id) => visible.includes(id));

        /** Төрөл бүрийн график — зөвхөн чектэй, утга нь 0-ээс их давхаргууд */
        const charts = GEOM_CHARTS.map((c) => {
          const items = on
            .map((id) => ({ id, d: LAYER_BY_ID[id], t: map.get(id) }))
            .filter((x) => x.d && x.t && chartOf(x.d, x.t) === c.geom)
            .map((x) => ({ x, v: c.value(x.d, x.t!) }))
            .filter((r) => r.v > 0)
            .sort((a, b) => b.v - a.v)
            .map((r) => ({
              key: r.x.id,
              label: r.x.d.title,
              value: r.v,
              display: c.display(r.v, r.x.t!),
              color: r.x.d.hue,
            }));
          // Нийт — графикийн толгойд «5 давхарга · 60.2 км» гэж
          const sum = items.reduce((a, i) => a + i.value, 0);
          return { ...c, items, sum };
        }).filter((c) => c.items.length > 0);

        /**
         * СОНГОСОН ДАВХАРГУУД БАГЦААР — багц бүр өөрийн хэсэгтэй.
         *
         * ⚠️ Каталогийн `0/6` товчоор багцыг бүхэлд нь асаахад тэр багцын БҮХ
         * давхарга энд нэг хэсэг болж гарна. Өөр багц нэмж асаахад ЭНЭ хэсэг
         * хэвээр үлдэж, доор нь ШИНЭ хэсэг нэмэгдэнэ — багцууд бие биенээ
         * дарж бичихгүй, зэрэгцэн харагдана.
         *
         * ⚠️ `flatMap` нь `filter(Boolean)`-ы оронд: сүүлийнх нь TypeScript-д
         * `null`-ыг хасч чаддаггүй тул доош хүчээр хөрвүүлэх шаардлагатай болно.
         */
        const pickedGroups = LAYER_GROUPS.flatMap((g) => {
          const layers = GROUP_LAYERS[g.key]
            .filter((id) => on.includes(id))
            .map((id) => ({ d: LAYER_BY_ID[id], t: map.get(id) }))
            .flatMap((x) => (x.d && x.t ? [{ d: x.d, t: x.t }] : []));
          if (!layers.length) return [];

          const n = layers.reduce((a, x) => a + x.t.n, 0);

          // Донат — тоогоор эзлэх хувь. Тоо нь нэгжгүй тул багц дотор ҮРГЭЛЖ зөв.
          const donut = layers
            .filter((x) => x.t.n > 0)
            .sort((a, b) => b.t.n - a.t.n)
            .map((x) => ({ key: x.d.id, label: x.d.title, value: x.t.n, color: x.d.hue }));

          /**
           * Баганан цуваа — НЭГЖ БҮРТ тусдаа.
           * ⚠️ «Зам» багцад 98.2 км шугам ба 26.7 га талбай хоёул бий. Нэг
           * график дээр тавибал баганын урт нь юуг ч илэрхийлэхгүй болно.
           */
          const series = GEOM_CHARTS.flatMap((c) => {
            const items = layers
              .filter((x) => chartOf(x.d, x.t) === c.geom)
              .map((x) => ({ x, v: c.value(x.d, x.t) }))
              .filter((r) => r.v > 0)
              .sort((a, b) => b.v - a.v)
              .map((r) => ({
                key: r.x.d.id,
                label: r.x.d.title,
                value: r.v,
                display: c.display(r.v, r.x.t),
                color: r.x.d.hue,
              }));
            if (!items.length) return [];
            return [{ ...c, items, sum: items.reduce((a, i) => a + i.value, 0) }];
          });

          /**
           * Дотоод ангилалаар задлах — давхарга × ангилал бүрт нэг чартын багц.
           *
           * ⚠️ Давхарга бүр ТУСДАА ArcGIS хүсэлт явуулна тул зөвхөн СОНГОСОН
           * давхаргад: бүх 29-д нь урьдчилж татвал каталог нээх бүрд 29
           * нэмэлт хүсэлт явна.
           *
           * ⚠️ Эхний ХОЁР ангиллаар хязгаарлав. «Барилга» 5 ангилалтай
           * (төлөв, зориулалт, дэлгэрэнгүй зориулалт, бүсийн төрөл, компани) —
           * бүгдийг зурвал ганц давхарга 15 чарт болж, бусад сонголт хэдэн
           * дэлгэц доор үлдэнэ. Эхний хоёр нь «юу вэ» (төлөв) ба «юунд
           * зориулсан» (зориулалт) хоёрыг хамарна.
           */
          const faceted = layers.flatMap((x) =>
            (x.d.facets ?? []).slice(0, 2).map((f) => ({ d: x.d, f })),
          );

          /**
           * ⚠️ ГАНЦ баганатай цуваа чарт ХЭРЭГГҮЙ. «Бүс» багц нэг давхаргатай
           * тул «Талбайн давхарга» чарт нь 100%-ийн ганц багана + нэг нэртэй
           * тайлбар болж, багцын картан дээрх «130.5 га»-г л давтдаг байлаа.
           * Оронд нь тэр давхаргын ТӨРЛҮҮД (доорх ангиллын чартууд) утга өгнө.
           *
           * ⚠️ Ангиллын чарт ч байхгүй бол цуваагаа ҮЛДЭЭНЭ — эс бөгөөс багцын
           * хэсэг бүрмөсөн хоосон болно.
           */
          const multi = series.filter((c) => c.items.length > 1);
          const shownSeries = multi.length > 0 || faceted.length > 0 ? multi : series;

          return [{
            g,
            ids: layers.map((x) => x.d.id),
            n,
            count: layers.length,
            donut,
            series: shownSeries,
            faceted,
          }];
        });

        /* ═══ ЕРӨНХИЙ ГОРИМ — сонголт хийгээгүй, эсвэл бүх чек арилсан ═══ */
        if (untouched || !on.length) {
          return (
            <>
              <Section title="Ерөнхий үзүүлэлт" note="төсөл бүхэлдээ">
                <Stats cols={2}>
                  <Stat value={num(allN)} label="Нийт" accent />
                  <Stat value={num(PLAN_LAYER_IDS.length)} label="Давхарга" />
                </Stats>
              </Section>

              {/**
                * БАГЦ БҮР нэг карт — төрлийн тоо, урт/талбай, цэгийн тоо.
                * ⚠️ Урьд нь донат + жагсаалт хоёроор харуулдаг байв: донат нь
                * зөвхөн ОБЪЕКТЫН ТООГ, жагсаалт нь зөвхөн ХЭМЖЭЭГ өгдөг тул
                * «Инженерийн бэлтгэлд юу байгаа вэ» гэдгийг мэдэхийн тулд хоёр
                * тусдаа хэсгээс мөрөө олж тааруулах шаардлагатай байлаа. Карт
                * нь багцын гурван хэмжигдэхүүнийг НЭГ дор өгнө.
                */}
              {/* ⚠️ Гарчиггүй — картууд өөрсдөө юу болохоо хэлнэ */}
              <Section>
                <div className={s.cardGrid} style={gridStyle(LAYER_GROUPS.length, true)}>
                  {LAYER_GROUPS.map((g) => (
                    <GroupCard
                      key={g.key}
                      g={g}
                      ids={GROUP_LAYERS[g.key]}
                      map={map}
                      // Том хэлбэр — үзүүлэлт хэвтээ эгнэж, тоо нь тод харагдана
                      wide
                      onClick={() => setVisible(GROUP_LAYERS[g.key].slice())}
                    />
                  ))}
                </div>
              </Section>

            </>
          );
        }

        /* ═══ СОНГОЛТЫН ГОРИМ — зөвхөн сонгосон багц/давхаргын чартууд ═══ */
        return (
          <>
                {/**
                  * Сонгосон багцууд — карт хэлбэрээр. Багана нь `auto-fit` тул
                  * 2 багц сонговол хоёр карт бүтэн өргөнийг эзлэн ТОМОРНО.
                  */}
                <Section
                  title="Сонгосон"
                  note={`${num(on.length)} давхарга · ${num(totalN)}`}
                >
                  <div className={s.cardGrid} style={gridStyle(pickedGroups.length)}>
                    {pickedGroups.map(({ g, ids, n, donut, series, faceted }) => (
                      <GroupCard
                        key={g.key}
                        g={g}
                        ids={ids}
                        map={map}
                        on
                        wide={pickedGroups.length <= CARD_WIDE_MAX}
                      >
                        {/* ⚠️ Ганц давхаргатай багцад донат утгагүй — 100%-ийн нэг зүсмэг */}
                        {donut.length > 1 && (
                          <div className={s.chartBlock}>
                            <Donut items={donut} center={num(n)} />
                          </div>
                        )}

                        {series.map((c) => (
                          <div key={c.geom} className={s.chartBlock}>
                            <div className={s.facetHead}>
                              {c.title}
                              <span className={s.facetNote}>
                                {/* ⚠️ Ширхэг нь БҮХЭЛ тоо — «1,651.0» гэж бичихгүй */}
                                {c.note === 'ширхэг' ? num(c.sum) : `${num(c.sum, 1)} ${c.note}`}
                              </span>
                            </div>
                            {/**
                              * ⚠️ Баганан дарахад давхаргын ДЭЛГЭРЭНГҮЙ рүү үсэрдэг байв —
                              * самбар солигдож, зурагт юу ч болдоггүй. Одоо тэр давхаргыг
                              * зурагт ДАНГААР нь үлдээж шүүнэ: график нь `visible`-ыг
                              * дагадаг тул самбар өөрөө шууд тэр давхарга дээр төвлөрнө.
                              */}
                            <Bars
                              items={c.items}
                              limit={8}
                              outlined
                              legend
                              selected={on.length === 1 ? on[0] : null}
                              onSelect={(id) => {
                                setLayer(null);
                                setVisible((prev) =>
                                  prev.length === 1 && prev[0] === id ? PLAN_LAYER_IDS.slice() : [id],
                                );
                              }}
                            />
                          </div>
                        ))}

                        {/* Давхарга бүрийн ДОТООД төрлүүд — өөрийн чартаар */}
                        {faceted.map(({ d, f }) => (
                          <LayerTypeCharts key={`${d.id}:${f.field}`} d={d} f={f} zone={zone} />
                        ))}
                      </GroupCard>
                    ))}
                  </div>
                </Section>

                {/* ⚠️ Сонголтыг цуцлах — 29 давхаргыг нэг нэгээр нь унтраах нь
                    тэвчээр барах ажил. Анхдагч байдалд буцаана: зураг бүсээ
                    харуулж, самбар ерөнхий чартууд руугаа эргэнэ. */}
                <Section>
                  <button
                    type="button"
                    className={s.zoomBtn}
                    onClick={() => setVisible(VIEW_BY_KEY.plan.initial.slice())}
                  >
                    Сонголтыг цуцлах · ерөнхий тойм руу
                  </button>
                </Section>
          </>
        );
      }}
    </Data>
  );
}

/* ═════════════════ Сонгосон давхаргын дотоод төрлүүд ═════════════════ */

/**
 * Давхаргыг АНХНЫ ангиллаараа задалж чарт болгоно — донат (тоо) + багана
 * (хэмжээ). Сонгосон багцын хэсэгт давхарга бүрийн доор орно.
 *
 * ⚠️ Урьд нь дотоод ангиллыг харах цорын ганц арга нь давхаргын нэр дээр дарж
 * ТУСДАА дэлгэрэнгүй самбар нээх байв — тэгэхэд сонгосон бусад давхарга
 * самбараас алга болдог тул харьцуулах боломжгүй болно. Одоо ангилал нь
 * сонголтын чартын хэсэгт өөрөө орж ирнэ.
 *
 * ⚠️ Хэмжээний багана нь ЗӨВХӨН `qty`-тэй давхаргад. «Барилга» шиг талбайтай
 * давхаргад төрөл бүрийн ТАЛБАЙ гарах нь гол утга — тоо ганцаараа «100 амины
 * сууц vs 20 орон сууц» гэж төөрөгдүүлнэ.
 */
function LayerTypeCharts({
  d, f, zone,
}: {
  d: LayerDef;
  f: { field: string; label: string };
  zone: string | null;
}) {
  const where = whereFor(d, zone);

  const q = useAsync(async () => {
    const rows = await queryGroup(layerUrl(d), f.field, layerStats(d), where);
    return groups(rows, f.field, 'Бүртгэгдээгүй', ['n', 'q'])
      .sort((a, b) => b.values.n - a.values.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id, f.field, where]);

  // ⚠️ Ганц ангилалтай бол задаргаа биш — давхарга өөрөө. Чарт нэмэхгүй.
  if (q.state !== 'ready' || q.data.length < 2) return null;

  const total = q.data.reduce((a, x) => a + x.values.n, 0);
  const paint = d.paint?.field === f.field ? d.paint : null;
  const colorOf = (label: string, i: number) =>
    (paint ? paint.values[label] : undefined) ?? PALETTE[i % PALETTE.length];

  const items = q.data.map((x, i) => ({
    key: `${d.id}:${x.label}`,
    label: x.label,
    value: x.values.n,
    color: colorOf(x.label, i),
  }));

  /** Хэмжээгээр — «Барилга» дээр төрөл бүрийн талбай, шугамд урт */
  const sized = d.qty
    ? q.data
      .filter((x) => x.values.q > 0)
      .map((x, i) => ({
        key: `${d.id}:q:${x.label}`,
        label: x.label,
        value: d.qty!.unit === 'м²' ? x.values.q / 10_000 : d.qty!.unit === 'км' ? x.values.q : x.values.q / 1_000,
        display: qtyText(d, x.values.q) ?? '',
        color: colorOf(x.label, i),
      }))
      .sort((a, b) => b.value - a.value)
    : [];

  /**
   * ⚠️ Гадна БҮРХҮҮЛГҮЙ (fragment): чартын блокууд нь багцын хэсэг доторх бусад
   * блокуудтай ЯГ НЭГ ТҮВШИНД байх ёстой — эс бөгөөс `.chartBlock + .chartBlock`
   * тусгаарлагч зураас нь бүрхүүлийн дотор хоригдож, хөрш чартуудын зааг
   * харагдахгүй болно.
   */
  return (
    <>
      <div className={s.chartBlock}>
        <div className={s.facetHead}>
          {d.title}
          <span className={s.facetNote}>{f.label} · {q.data.length} төрөл</span>
        </div>

        {/* Донат — төрлийн эзлэх хувь. 8-аас олон зүсмэг уншигдахгүй тул багана л үлдэнэ. */}
        {items.length <= 8 && (
          <div style={{ margin: '10px 0 12px' }}>
            <Donut items={items} center={num(total)} />
          </div>
        )}

        <Bars
          items={items.map((it) => ({ ...it, display: num(it.value) }))}
          limit={8}
          outlined
          legend
        />
      </div>

      {sized.length > 1 && (
        <div className={s.chartBlock}>
          <div className={s.facetHead}>
            {d.qty!.unit === 'м²' ? 'Талбай төрлөөр' : 'Урт төрлөөр'}
            <span className={s.facetNote}>{qtyText(d, q.data.reduce((a, x) => a + x.values.q, 0))}</span>
          </div>
          <Bars items={sized} limit={8} outlined legend />
        </div>
      )}
    </>
  );
}

/* ═════════════════ Нэг давхаргын дашбоард ═════════════════ */

/**
 * Сонгосон давхаргын дашбоард:
 *
 *   · үндсэн үзүүлэлт  — объект, хэмжээ, нэг объектын дундаж
 *   · ангилал бүрээр   — тоо + хэмжээ
 *   · бүсээр           — тоо + хэмжээ
 *
 * ⚠️ ӨРТГИЙН мэдээлэл ЭНД БАЙХГҮЙ. Санхүүгийн бүх тооцоо «Тохиромжтой байдлын
 * үнэлгээ» модульд төвлөрсөн: тэнд нэгж үнэ, барилгын өртөг, ашиг зэрэг нь
 * загварын хэсэг бөгөөд гулсуураар тохируулагддаг. Хоёр газарт мөнгөн дүн
 * үзүүлбэл аль нь эрх мэдэлтэй нь ойлгомжгүй болно.
 */
function LayerDashboard({
  d,
  totals,
  zone,
  on,
  toggle,
  onBack,
}: {
  d: LayerDef;
  totals: Async<Map<string, Totals>>;
  zone: string | null;
  on: boolean;
  toggle: () => void;
  onBack: () => void;
}) {
  const { setHighlight, zoomToLayer } = useMap();
  const [sel, setSel] = useState<string | null>(null);
  const where = whereFor(d, zone);
  const g = groupOf(d.id);
  const groupTitle = LAYER_GROUPS.find((x) => x.key === g)?.title ?? '';

  const q = useAsync(async () => {
    const url = layerUrl(d);
    const stats = layerStats(d);
    const KEYS = ['n', 'q'];

    const [facetRaw, zoneRaw] = await Promise.all([
      Promise.all((d.facets ?? []).map((f) => queryGroup(url, f.field, stats, where))),
      d.noZone || zone ? Promise.resolve(null) : queryGroup(url, ZONE_FIELD, stats, where),
    ]);

    const facets = (d.facets ?? []).map((f, i) => ({
      ...f,
      items: groups(facetRaw[i], f.field, 'Бүртгэгдээгүй', KEYS),
    }));

    const byZone = zoneRaw
      ? groups(zoneRaw, ZONE_FIELD, 'Тодорхойгүй', KEYS)
        .filter((x) => x.label.trim() !== ZONE_NONE.trim())
        .sort((a, b) => b.values.n - a.values.n)
      : null;

    return { facets, byZone };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id, where]);

  const pick = (key: string, w: string | null) => {
    const next = sel === key ? null : key;
    setSel(next);
    setHighlight(next ? w : null);
  };

  const t = totals.state === 'ready' ? totals.data.get(d.id) : undefined;
  const qty = t ? qtyText(d, t.q) : null;

  /** Нэг объектод ногдох дундаж хэмжээ (шугам → м, талбай → м²) */
  const avgQty = t && d.qty && t.n > 0 ? t.q / t.n : null;

  return (
    <div style={{ '--tone': d.hue } as CSSProperties}>
      <div className={s.crumb}>
        <button type="button" className={s.crumbBack} onClick={onBack}>‹ Жагсаалт</button>
        {groupTitle && <span className={s.crumbGroup}>{groupTitle}</span>}
      </div>

      <Section>
        <div className={s.headRow}>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={`${d.title} — зурагт харуулах`}
            className={`${s.check} ${on ? s.checkOn : ''}`}
            onClick={toggle}
          >
            <svg viewBox="0 0 12 12" width="10" height="10">
              <path d="M2 6.2 4.6 8.8 10 3.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className={s.headText}>
            <h3 className={s.headTitle}>
              <LayerSwatch d={d} /> {d.title}
            </h3>
            <p className={s.headNote}>
              {geomText(d)}
              {d.note ? ` · ${d.note}` : ''}
              {!on && ' · зурагт нуугдсан'}
            </p>
          </div>
        </div>

        {totals.state === 'error' ? (
          <Empty label="Үзүүлэлт татагдсангүй." />
        ) : (
          <Stats cols={avgQty != null ? 3 : 2}>
            <Stat value={t ? num(t.n) : '…'} label="Тоо" accent />
            <Stat value={qty ?? '—'} label={d.qty?.unit === 'м²' ? 'Талбай' : 'Урт'} />
            {avgQty != null && (
              <Stat
                value={num(avgQty, 1)}
                unit={d.qty!.unit}
                label={`Дундаж ${d.qty!.unit === 'м²' ? 'талбай' : 'урт'}`}
              />
            )}
          </Stats>
        )}

        {zone && d.noZone && (
          <p className={s.warnNote}>
            Энэ давхаргад <b>ZONE_ID</b> талбар байхгүй тул «{zone}» бүсийн шүүлт
            үйлчлээгүй — дүн нь төслийн бүхэлдээ.
          </p>
        )}

        <button type="button" className={s.zoomBtn} onClick={() => zoomToLayer(d.id)}>
          Зурагт төвлөрөх
        </button>
      </Section>

      <Data q={q} loading="Задаргаа тооцож байна…">
        {(x) => {
          const facets = x.facets.filter((f) => f.items.length >= 2);
          const hasZone = x.byZone && x.byZone.length > 1;

          return (
            <>
              {/* ── Ангилал бүрээр — ЭХНИЙ ангиллыг дугаар диаграмаар (дашбоард төрх) ── */}
              {facets.map((f, idx) => {
                const paint = d.paint?.field === f.field ? d.paint : null;
                const colorOf = (label: string, i: number) =>
                  (paint ? paint.values[label] : undefined) ?? PALETTE[i % PALETTE.length];
                const total = f.items.reduce((a, i) => a + i.values.n, 0);
                const items = f.items.map((item, i) => ({
                  key: `${f.label}:${item.label}`,
                  label: item.label,
                  value: item.values.n,
                  // ⚠️ Тоо ГАНЦААРАА хангалтгүй: 12 хэрчимтэй кабель трасс 1.8 км,
                  //    3,200 хэрчимтэй дулаан 49.7 км — хэмжээг ч заана.
                  display: [
                    `${num(item.values.n)}`,
                    qtyText(d, item.values.q),
                  ].filter(Boolean).join(' · '),
                  color: colorOf(item.label, i),
                }));
                return (
                  <Section
                    key={f.label}
                    title={f.label}
                    note={`${f.items.length} ангилал · дарж зурагт шүүнэ`}
                  >
                    {/* Эхний ангиллыг дугуй диаграмаар — эзлэх хувийг нэг дор */}
                    {idx === 0 && f.items.length <= 8 && (
                      <div style={{ marginBottom: 14 }}>
                        <Donut
                          items={items.map((it) => ({ key: it.key, label: it.label, value: it.value, color: it.color }))}
                          center={num(total)}
                          
                        />
                      </div>
                    )}
                    <Bars
                      color={d.hue}
                      limit={8}
                      selected={sel}
                      onSelect={(k) => {
                        const item = f.items.find((y) => `${f.label}:${y.label}` === k);
                        pick(k, item ? groupWhere(f.field, item) : null);
                      }}
                      items={items}
                    />
                  </Section>
                );
              })}

              {/* ── Бүсээр ── */}
              {hasZone && (
                <Section
                  title="Бүсээр"
                  note={`${x.byZone!.length} бүс · дарж зурагт шүүнэ`}
                >
                  <Bars
                    color={d.hue}
                    limit={8}
                    selected={sel}
                    onSelect={(k) => {
                      const item = x.byZone!.find((y) => `бүс:${y.label}` === k);
                      pick(k, item ? groupWhere(ZONE_FIELD, item) : null);
                    }}
                    items={x.byZone!.map((item) => ({
                      key: `бүс:${item.label}`,
                      label: item.label,
                      value: item.values.n,
                      display: [
                        `${num(item.values.n)}`,
                        qtyText(d, item.values.q),
                      ].filter(Boolean).join(' · '),
                    }))}
                  />
                </Section>
              )}

              {!facets.length && !hasZone && (
                <Section>
                  <Empty label="Энэ давхаргад задлах ангилал бүртгэгдээгүй." />
                </Section>
              )}
            </>
          );
        }}
      </Data>
    </div>
  );
}

/* ═════════════════ Бүсийн шүүлт ═════════════════ */

function ZoneBar({ zone, setZone }: { zone: string | null; setZone: (z: string | null) => void }) {
  const { zoomToZone } = useMap();
  const [open, setOpen] = useState(false);

  const q = useAsync(async () => {
    const rows = await queryGroup(layerUrl(ZONE_LAYER), ZONE_FIELDS.id, [count(OID, 'n')]);
    return groups(rows, ZONE_FIELDS.id, 'Тодорхойгүй', ['n'])
      .filter((g) => g.label !== 'Тодорхойгүй')
      .sort((a, b) => a.label.localeCompare(b.label, 'mn'));
  }, []);

  if (zone) {
    return (
      <div className={s.zoneBar}>
        <span className={s.zoneBarLabel}>Бүс</span>
        <span className={s.zoneBarValue}>{zone}</span>
        <button type="button" className={s.zoneBarBtn} onClick={() => zoomToZone(zone)}>Төвлөрөх</button>
        <button type="button" className={s.zoneBarClear} onClick={() => setZone(null)}>Цуцлах</button>
      </div>
    );
  }

  /**
   * ⚠️ Бүсийн 52 чип нь анхнаасаа задгай байвал самбарын эхний дэлгэцийг бүтнээр
   * эзэлж, гол агуулга нь доор нуугдана. Тиймээс хумигдсанаар эхэлнэ.
   */
  return (
    <div className={s.zoneBar}>
      <span className={s.zoneBarLabel}>Бүс</span>
      <span className={s.zoneBarValue}>Бүгд</span>
      <button type="button" className={s.zoneBarBtn} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Хаах' : 'Бүс сонгох'}
      </button>

      {open && (
        <div className={s.zoneDrop}>
          <Data q={q} loading="Бүсүүд…">
            {(zs) => (
              <div className={s.zoneGrid}>
                {zs.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    className={s.zoneChip}
                    onClick={() => { setZone(g.label); setOpen(false); }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
          </Data>
        </div>
      )}
    </div>
  );
}

/* ═════════════════ Барилгын хяналт ═════════════════ */

/**
 * ⚠️ Асинк хүсэлтийг ЭНД нэг удаа дуудаж `BuildingWork` руу дамжуулна.
 * Урьд нь энд бас `SurveyReports`/`SurveyOutside`-ыг ДАХИН зурдаг байсан тул
 * тайлангийн жагсаалт хоёр хувь харагдаж, ижил хүсэлт хоёр удаа явдаг байв.
 */
function MonitorPanel({
  picked,
  pickedLayer,
}: {
  picked: Record<string, unknown> | null;
  pickedLayer: string | null;
}) {
  const survey = useSurvey();
  const outside = useOutside();

  return (
    <>
      <BuildingWork
        picked={picked}
        pickedLayer={pickedLayer}
        survey={survey}
        outside={outside}
      />
      <BuildingSummary />
      <SurveySummary />
    </>
  );
}

/* ═════════════════ Сонгосон бүс ═════════════════ */

function PickedZone({
  attrs, zone, setZone,
}: {
  attrs: Record<string, unknown>;
  zone: string | null;
  setZone: (z: string | null) => void;
}) {
  const F = ZONE_FIELDS;
  const id = text(attrs[F.id], '');
  const type = text(attrs[F.type], 'Тодорхойгүй');

  const q = useAsync(async () => {
    const B = BUILT_FIELDS;
    const where = `${ZONE_FIELD} = ${sqlStr(id)}`;
    const byStatus = await queryGroup(layerUrl(BUILT_LAYER), B.status, [
      count(OID, 'n'), sum(B.households, 'urh'), sum(B.population, 'pop'),
    ], where);
    const rows = groups(byStatus, B.status, 'Тодорхойгүй', ['n', 'urh', 'pop']);
    const status = BUILT_STATUS.map((st) => {
      const g = rows.find((r) => r.label === st.value);
      return { ...st, n: g?.values.n ?? 0, urh: g?.values.urh ?? 0, pop: g?.values.pop ?? 0 };
    });
    return {
      status,
      built: status.reduce((a, x) => a + x.n, 0),
      urh: status.reduce((a, x) => a + x.urh, 0),
      pop: status.reduce((a, x) => a + x.pop, 0),
    };
  }, [id]);

  const n = (f: string) => {
    const v = attrs[f];
    return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
  };
  const budget = n(F.budget) ?? 0;

  if (!id) return null;

  return (
    <Section title="Сонгосон бүс">
      <div className={s.zoneHead} style={{ '--tone': ZONE_TYPES[type] ?? ZONE_TYPE_EMPTY_HUE } as CSSProperties}>
        <span className={s.zoneHeadId}>{id}</span>
        <span className={s.zoneHeadType}>{type}</span>
      </div>

      <Stats cols={3}>
        <Stat value={num(n(F.landHa), 2)} unit="га" label="Талбай" accent />
        <Stat value={num(n(F.households))} label="Төлөвлөсөн айл" />
        <Stat value={num((n(F.builtM2) ?? 0) / 1000, 0)} unit="мянган м²" label="Барилгын талбай" />
      </Stats>

      <div style={{ marginTop: 10 }}>
        <Rows
          items={[
            { key: 'FAR / BCR', value: <span className="num">{num(n(F.far), 2)} / {num(n(F.bcr), 2)}</span> },
            { key: 'Зогсоол (норм / төлөвлөсөн)', value: <span className="num">{num(n(F.parkNorm))} / {num(n(F.parkPlan))}</span> },
            ...(text(attrs[F.contractor], '') ? [{ key: 'Гүйцэтгэгч', value: text(attrs[F.contractor]) }] : []),
            // ⚠️ «Батлагдсан төсөв» ХАСАГДСАН: санхүүгийн бүх дүн «Тохиромжтой
            //    байдлын үнэлгээ» модульд төвлөрсөн.
          ]}
        />
      </div>

      <Data q={q} loading="Бүсийн барилга…">
        {(x) => x.built === 0 ? null : (
          <div style={{ marginTop: 16 }}>
            <div className={s.facetHead}>
              Барилга <span className={s.facetNote}>{num(x.built)} ш · {num(x.urh)} өрх · {num(x.pop)} хүн</span>
            </div>
            <Bars
              items={x.status.map((st) => ({
                key: st.value, label: st.value, value: st.n,
                display: `${num(st.n)}`, color: st.hue,
              }))}
            />
          </div>
        )}
      </Data>

      {zone !== id && (
        <button type="button" className={s.zoomBtn} onClick={() => setZone(id)}>
          Энэ бүсээр бүгдийг шүүх
        </button>
      )}
    </Section>
  );
}

/* ═════════════════ Сонгосон объект ═════════════════ */

function PickedFeature({
  attrs, def, setZone, isolated, onIsolate,
}: {
  attrs: Record<string, unknown>;
  def: LayerDef;
  setZone: (z: string | null) => void;
  /** Зурагт ЗӨВХӨН энэ давхарга үлдсэн эсэх */
  isolated: boolean;
  onIsolate: () => void;
}) {
  const { setHighlight } = useMap();
  const [active, setActive] = useState<string | null>(null);

  const zoneId = text(attrs[ZONE_FIELD], '').trim();
  const hasZone = zoneId !== '' && zoneId !== ZONE_NONE.trim();

  const rows: { key: string; value: React.ReactNode }[] = [];
  if (def.qty && attrs[def.qty.field] != null) {
    rows.push({
      key: def.qty.unit === 'м²' ? 'Талбай' : 'Урт',
      value: <span className="num">{num(Number(attrs[def.qty.field]), 1)} {def.qty.unit}</span>,
    });
  }
  // ⚠️ «Нэгж үнэ» ХАСАГДСАН — санхүүгийн дүн зөвхөн анализын модульд.
  if (def.id === BUILT_LAYER.id) {
    for (const [f, label] of [
      [BUILT_FIELDS.floors, 'Давхар'],
      [BUILT_FIELDS.households, 'Өрхийн тоо'],
      [BUILT_FIELDS.population, 'Хүн ам'],
    ] as [string, string][]) {
      if (attrs[f] == null) continue;
      rows.push({ key: label, value: <span className="num">{num(Number(attrs[f]))}</span> });
    }
  }

  const filters = (def.facets ?? [])
    .map((f) => ({ ...f, value: attrs[f.field] }))
    .filter((f) => f.value != null && String(f.value).trim() !== '');

  const apply = (field: string, value: unknown) => {
    const k = `${field}:${value}`;
    const next = active === k ? null : k;
    setActive(next);
    setHighlight(next ? `${field} = ${sqlStr(String(value))}` : null);
  };

  return (
    <Section title="Сонгосон" note={def.title}>
      {hasZone && (
        <button type="button" className={s.zoneJump} onClick={() => setZone(zoneId)}>
          <span className={s.zoneJumpLabel}>Бүс</span>
          <span className={s.zoneJumpValue}>{zoneId}</span>
          <span className={s.zoneJumpGo}>шүүх →</span>
        </button>
      )}

      {rows.length > 0 && <Rows items={rows} />}

      {filters.length > 0 && (
        <div className={s.filters} style={{ marginTop: rows.length ? 12 : 0 }}>
          {filters.map((f) => {
            const k = `${f.field}:${f.value}`;
            const on = active === k;
            return (
              <button
                key={f.field}
                type="button"
                aria-pressed={on}
                className={`${s.filter} ${on ? s.filterOn : ''}`}
                style={{ '--tone': def.hue } as CSSProperties}
                onClick={() => apply(f.field, f.value)}
              >
                <span className={s.filterKey}>{f.label}</span>
                <span className={s.filterVal}>{text(f.value)}</span>
              </button>
            );
          })}
        </div>
      )}

      {rows.length === 0 && filters.length === 0 && <Empty label="Энэ дээр бүртгэгдсэн талбар алга." />}

      {/**
        * ⚠️ Зураг дээр дарсны дараа «энэ юу вэ» гэдгийг харуулдаг байсан ч тэр
        * давхаргыг дангаар нь шүүж харах арга байхгүй байв — 29 давхарга
        * дээр дээрээсээ давхарлан зурагдсан үед сонирхсон объектоо ялгаж
        * харах боломжгүй. Нэг товчоор ЗӨВХӨН тэр давхаргыг үлдээнэ.
        */}
      <button type="button" className={s.zoomBtn} onClick={onIsolate}>
        {isolated ? 'Бүх давхаргыг буцааж харуулах' : `Зөвхөн «${def.title}»-г харуулах`}
      </button>
    </Section>
  );
}
