'use client';

import { useEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { useSyncRef } from '@/lib/useSyncRef';
import { t as tr } from '@/lib/i18nCore';
import { Section, Stats, Stat, Bars, Donut, Rows, Data, Empty } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { LayerSwatch } from '@/components/LayerSwatch';
import { useMap } from '@/components/MapCanvas';
import { useFilter } from '@/lib/filter';
import { useAsync, type Async } from '@/lib/useAsync';
import { queryGroup, queryGroupEx, count, sum, groups, groupWhere, sqlStr, type Group } from '@/lib/query';
import {
  LAYER_BY_ID, layerUrl, oidOf, ZONE_FIELD, ZONE_NONE, ZONE_LAYER, ZONE_FIELDS,
  BUILT_LAYER, BUILT_FIELDS, BUILT_STATUS, ZONE_TYPES, ZONE_TYPE_EMPTY_HUE, zoneType, zoneCanon, zoneWhere,
  LAYER_GROUPS, GROUP_LAYERS, PLAN_LAYER_IDS, PARCEL_LEFT, groupOf, VIEW_BY_KEY, facetName,
  type LayerDef, type ViewKey,
} from '@/lib/services';
import { zoneLabel } from '@/lib/zoneLabel';
import { whereFor, qtyText, geomText, layerStats, retryTotals, avgQty, useLazyTotals, type Totals } from '@/lib/totals';
import { POPULATION_FIELD } from '@/lib/live';
import { num, text, shade } from '@/lib/format';
import { toggleIsolate, zoomWhereFor, type Iso } from './viewPanelLogic';
import s from './dashboard.module.css';

/** «Бүртгэгдээгүй / Тодорхойгүй» бүлэг — жинхэнэ ангилал мэт харагдах ёсгүй */
const BLANK_HUE = ZONE_TYPE_EMPTY_HUE;

const ownsHighlight = (h: { where: string | null; only?: string | string[] }, id: string): boolean =>
  !!h.where && (h.only === id || (Array.isArray(h.only) && h.only.includes(id)));

/**
 * Ангилал → монохром сүүдэр (донат ба багана ижил түлхүүрээр нэг өнгөтэй).
 * Тинтийн логик нь портал даяар нэг — `lib/format.ts::shade`. «Бүртгэгдээгүй»
 * саарал хэвээр.
 */
const monoShades = (d: LayerDef, rows: { label: string; blank?: boolean }[]) =>
  new Map(rows.map((x, i) => [x.label, x.blank ? BLANK_HUE : shade(d.hue, i, rows.length)]));

/* ═════════════════ Үндсэн самбар ═════════════════ */

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
  const def = layer ? LAYER_BY_ID[layer] : null;

  /**
   * НЭГ ДАВХАРГЫГ ДАНГААР НЬ ҮЛДЭЭХ — дахин дарвал ӨМНӨХ олонлог руу буцна.
   */
  const isoRef = useRef<Iso>(null);
  const isolate = (id: string) => {
    const r = toggleIsolate(visible, id, isoRef.current, PLAN_LAYER_IDS);
    isoRef.current = r.iso;
    setVisible(r.next);
  };

  return (
    <>

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
                onIsolate={() => isolate(pickedLayer)}
              />
            )
            : null
      )}

      {def ? (
        <LayerDashboard
          d={def}
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
          view={view}
          totals={totals}
          zone={zone}
          visible={visible}
          setVisible={setVisible}
          setLayer={setLayer}
          isolateLayer={isolate}
        />
      )}
    </>
  );
}

/* ═════════════════ Тойм — сонгосон давхаргууд, геометрийн төрлөөр ═════════════════ */

/**
 * ГЕОМЕТРИЙН ТӨРӨЛ бүрийн хэмжигдэхүүн.
 */
const GEOM_CHARTS = [
  {
    geom: 'area' as const,
    get title() { return tr('Талбайн давхарга'); },
    /** Индикаторын богино шошго — «Талбай 157.2 га» */
    get short() { return tr('Талбай'); },
    get note() { return tr('га'); },
    /** м² → га */
    value: (d: LayerDef, t: Totals) => (d.qty && t.q != null ? t.q / 10_000 : 0),
    display: (d: LayerDef, _v: number, t: Totals) => `${qtyText(d, t.q) ?? '—'} · ${num(t.n)}`,
  },
  {
    geom: 'line' as const,
    get title() { return tr('Шугаман давхарга'); },
    get short() { return tr('Урт'); },
    get note() { return tr('км'); },
    /** «м» → км; «км» нэгжтэй давхарга шууд */
    value: (d: LayerDef, t: Totals) => (!d.qty || t.q == null ? 0 : d.qty.unit === 'км' ? t.q : t.q / 1_000),
    display: (d: LayerDef, _v: number, t: Totals) => `${qtyText(d, t.q) ?? '—'} · ${num(t.n)}`,
  },
  {
    geom: 'point' as const,
    get title() { return tr('Цэгэн давхарга'); },
    get short() { return tr('Цэг'); },
    get note() { return tr('ширхэг'); },
    /** Цэгт хэмжээ гэж байхгүй — тоо нь өөрөө хэмжигдэхүүн */
    value: (_d: LayerDef, t: Totals) => t.n,
    display: (_d: LayerDef, v: number) => `${num(v)}`,
  },
  {
    geom: 'other' as const,
    get title() { return tr('Хэмжээ бүртгэгдээгүй'); },
    get short() { return tr('Хэмжээгүй'); },
    get note() { return tr('ширхэг'); },
    value: (_d: LayerDef, t: Totals) => t.n,
    display: (_d: LayerDef, v: number) => `${num(v)}`,
  },
];

/**
 * `qtyText`-ийн нэгжийн тодорхойлолт — БАГЦ/ЧАРТЫН НИЙЛБЭРТ (давхаргагүй дүн).
 */
const KM_QTY = { qty: { field: '', unit: 'км' } } as LayerDef;
const M2_QTY = { qty: { field: '', unit: 'м²' } } as LayerDef;
/** км → «12.3 км» / «450 м» */
const kmText = (v: number) => qtyText(KM_QTY, v) ?? '—';
/** га → «12.3 га» / «850 м²» */
const haText = (v: number) => qtyText(M2_QTY, v * 10_000) ?? '—';
/** «12.3 км» → { v: '12.3', k: 'км' } — картын тоо/нэгжийн хоёр хэсэгт */
const splitQty = (x: string) => {
  const i = x.lastIndexOf(' ');
  return i < 0 ? { v: x, k: '' } : { v: x.slice(0, i), k: x.slice(i + 1) };
};

/**
 * Давхарга аль графикт орох вэ.
 *
 * Цэг → үргэлж «цэгэн». Талбай/шугам нь ХЭМЖЭЭТЭЙ бол өөрийн нэгжийн графикт,
 * хэмжээгүй бол «бүртгэгдээгүй» рүү — аль нэгэнд нь ЗААВАЛ орно.
 */
const chartOf = (d: LayerDef, t: Totals): 'area' | 'line' | 'point' | 'other' =>
  d.geom === 'point' ? 'point'
    : d.qty && t.q != null && t.q > 0 ? d.geom
      : 'other';

/**
 * БАГЦЫН нэгдсэн хэмжигдэхүүн — картанд харуулах утгууд.
 */
function cardStats(ids: string[], map: ReadonlyMap<string, Totals>) {
  let km = 0, ha = 0, pts = 0, n = 0;
  for (const id of ids) {
    const d = LAYER_BY_ID[id];
    const t = map.get(id);
    if (!d || !t) continue;
    n += t.n;
    if (d.geom === 'point') { pts += t.n; continue; }
    if (!d.qty || t.q == null || t.q <= 0) continue;
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
   */
  children?: React.ReactNode;
}) {
  const x = cardStats(ids, map);
  const partial = ids.some((id) => LAYER_BY_ID[id] && !map.has(id));
  const rows: { v: string; k: string }[] = [];
  if (!partial) {
    if (x.km > 0) rows.push(splitQty(kmText(x.km)));
    if (x.ha > 0) rows.push(splitQty(haText(x.ha)));
    if (x.pts > 0) rows.push({ v: num(x.pts), k: tr('цэг') });
  }

  const body = (
    <>
      <span className={s.cardHead}>
        <span className={s.cardIcon}><Icon name={g.icon} size={13} /></span>
        <span className={s.cardTitle}>{g.title}</span>
      </span>
      <span className={s.cardStats}>
        <span className={s.cardStat}>
          <span className={`${s.cardVal} num`}>{num(x.layers)}</span>
          <span className={s.cardKey}>{tr('төрөл')}</span>
        </span>
        {rows.map((r) => (
          <span key={r.k} className={s.cardStat}>
            <span className={`${s.cardVal} num`}>{r.v}</span>
            <span className={s.cardKey}>{r.k}</span>
          </span>
        ))}
        {!rows.length && (
          <span className={s.cardStat}>
            <span className={`${s.cardVal} num`}>{partial ? '—' : num(x.n)}</span>
            <span className={s.cardKey}>{tr('объект')}</span>
          </span>
        )}
      </span>
    </>
  );

  const cls = `${s.card} ${wide ? s.cardWide : ''} ${on ? s.cardOn : ''} ${children ? s.cardFull : ''}`;
  const st = { '--tone': 'var(--hue)' } as CSSProperties;

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
 */
function PlanOverview({
  view,
  totals,
  zone,
  visible,
  setVisible,
  setLayer,
  isolateLayer,
}: {
  /** Шүүлт аль харагдацад харьяалагдахыг тэмдэглэнэ (харагдац солиход цэвэрлэгдэнэ) */
  view: ViewKey;
  totals: Async<Map<string, Totals>>;
  zone: string | null;
  visible: string[];
  setVisible: Dispatch<SetStateAction<string[]>>;
  setLayer: (id: string | null) => void;
  /** Дангаарчлах/буцаах — `ViewPanel`-ийн санамжтай (`toggleIsolate`) */
  isolateLayer: (id: string) => void;
}) {
  /**
   * Нэг давхаргыг ДАНГААР нь үлдээх — дахин дарвал ӨМНӨХ олонлог руу буцна.
   */
  const isolate = (id: string) => {
    setLayer(null);
    isolateLayer(id);
  };

  return (
    <Data q={totals} loading={tr('Үзүүлэлт тооцож байна…')}>
      {(map) => {
        const counted = PLAN_LAYER_IDS.filter((id) => !(zone && LAYER_BY_ID[id]?.noZone));
        const missing = counted.filter((id) => !map.has(id));
        const allN = missing.length ? null : counted.reduce((a, id) => a + (map.get(id)?.n ?? 0), 0);
        const cardIds = (key: keyof typeof GROUP_LAYERS) => GROUP_LAYERS[key].filter((id) => counted.includes(id));

        const on = counted.filter((id) => visible.includes(id));
        const onMissing = on.filter((id) => !map.has(id));
        const totalN = onMissing.length ? null : on.reduce((a, id) => a + (map.get(id)?.n ?? 0), 0);

        /**
         * БҮСЭЭР ШҮҮГДЭЭГҮЙ СОНГОСОН ДАВХАРГА — `ZONE_ID`-гүй (`noZone`).
         */
        const zoneless = zone ? PLAN_LAYER_IDS.filter((id) => LAYER_BY_ID[id]?.noZone && visible.includes(id)) : [];
        const zonelessList = zoneless.length > 0 ? (
          <Section title={tr('Бүсээр шүүгдээгүй давхарга')} note={tr('ZONE_ID талбаргүй — дүн нь төслийн нийт')}>
            <Rows
              items={zoneless.map((id) => {
                const d = LAYER_BY_ID[id];
                const t = map.get(id);
                return {
                  key: d.title,
                  value: (
                    <>
                      <span className="num">
                        {t ? [num(t.n), qtyText(d, t.q)].filter(Boolean).join(' · ') : '—'}
                      </span>{' '}
                      <span className={s.facetNote}>{tr('төслийн нийт')}</span>
                    </>
                  ),
                };
              })}
            />
          </Section>
        ) : null;

        /**
         * Хэрэглэгч хараахан сонголт хийгээгүй эсэх — анхдагч багцтай ЯГ тэнцүү.
         */
        const initial = VIEW_BY_KEY.plan.initial;
        const untouched =
          visible.length === initial.length && initial.every((id) => visible.includes(id));

        /**
         * СОНГОСОН ДАВХАРГУУД БАГЦААР — багц бүр өөрийн хэсэгтэй.
         */
        const pickedGroups = LAYER_GROUPS.flatMap((g) => {
          const layers = GROUP_LAYERS[g.key]
            .filter((id) => on.includes(id))
            .map((id) => ({ d: LAYER_BY_ID[id], t: map.get(id) }))
            .flatMap((x) => (x.d && x.t ? [{ d: x.d, t: x.t }] : []));
          if (!layers.length) return [];

          const groupMissing = GROUP_LAYERS[g.key].some((id) => on.includes(id) && !map.has(id));
          const n = groupMissing ? null : layers.reduce((a, x) => a + x.t.n, 0);

          // Донат — тоогоор эзлэх хувь. Тоо нь нэгжгүй тул багц дотор ҮРГЭЛЖ зөв.
          const donut = layers
            .filter((x) => x.t.n > 0)
            .sort((a, b) => b.t.n - a.t.n)
            .map((x, i, arr) => ({ key: x.d.id, label: x.d.title, value: x.t.n, color: shade(g.hue, i, arr.length) }));

          /**
           * Баганан цуваа — НЭГЖ БҮРТ тусдаа.
           */
          const series = GEOM_CHARTS.flatMap((c) => {
            const items = layers
              .filter((x) => chartOf(x.d, x.t) === c.geom)
              .map((x) => ({ x, v: c.value(x.d, x.t) }))
              .filter((r) => r.v > 0)
              .sort((a, b) => b.v - a.v)
              .map((r, i, arr) => ({
                key: r.x.d.id,
                label: r.x.d.title,
                value: r.v,
                display: c.display(r.x.d, r.v, r.x.t),
                color: shade(g.hue, i, arr.length),
              }));
            if (!items.length) return [];
            return [{ ...c, items, sum: items.reduce((a, i) => a + i.value, 0) }];
          });

          /**
           * Дотоод ангилалаар задлах — давхарга × ангилал бүрт нэг чартын багц.
           */
          const faceted = layers.flatMap((x) => {
            const fs = (x.d.facets ?? []).slice(0, 2);
            if (fs.length) return fs.map((f) => ({ d: x.d, f }));
            /**
             * Ийм давхаргад БҮСЭЭР задлах нь утга бүхий задаргаа: «энэ шугам
             * 52 бүсийн алинд хэр урттай вэ».
             */
            if (x.d.noZone || zone) return [];
            return [{ d: x.d, f: { field: x.d.zoneField ?? ZONE_FIELD, label: tr('Бүсээр') } }];
          });

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
              <Section title={tr('Ерөнхий үзүүлэлт')} note={zone ? tr('бүс: {0}', zone) : tr('төсөл бүхэлдээ')}>
                <Stats cols={2}>
                  <Stat value={num(allN)} unit={tr('объект')} label={tr('Нийт')} accent />
                  <Stat value={num(counted.length)} unit={tr('ш')} label={tr('Давхарга')} />
                </Stats>
                {missing.length > 0 && (
                  <p className={s.warnNote} role="alert">
                    {tr('{0} давхарга татагдсангүй', num(missing.length))}{' '}
                    <button type="button" className={s.zoneBarBtn} onClick={retryTotals}>{tr('Дахин оролдох')}</button>
                  </p>
                )}
                {zone && !untouched && visible.length > 0 && !on.length && (
                  <p className={s.warnNote}>
                    {tr('Сонгосон давхаргуудад бүсийн талбар (ZONE_ID) байхгүй тул бүсээр шүүгдэхгүй — бүсийн тоймыг харуулав.')}
                  </p>
                )}
              </Section>

              {zonelessList}

              {/**
                * БАГЦ БҮР нэг карт — төрлийн тоо, урт/талбай, цэгийн тоо.
                */}
              <Section>
                <div className={s.cardGrid} style={gridStyle(LAYER_GROUPS.filter((g) => cardIds(g.key).length > 0).length, true)}>
                  {LAYER_GROUPS.filter((g) => cardIds(g.key).length > 0).map((g) => (
                    <GroupCard
                      key={g.key}
                      g={g}
                      ids={cardIds(g.key)}
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
                  * Сонгосон багцууд — «Ерөнхий дашбоард»-ын дэлгэрэнгүй самбартай
                  * ИЖИЛ ЗАРЧМААР: багц бүр өөрийн БАГАНА болж ЗҮҮНЭЭС БАРУУН
                  * зэрэгцэнэ (доош цувахгүй). 2+ багц сонгоход самбар өөрөө
                  * өргөсөж хоёр баганыг зэрэг харуулна (`Portal`-д `--panel`);
                  * түүнээс олон бол багана нь хэвтээгээр гүйнэ (`.pickedGrid`).
                  * Ганц багцад хуучнаар нэг бүтэн өргөн карт үлдэнэ.
                  */}
                <Section
                  title={tr('Сонгосон')}
                  note={tr('{0} давхарга · {1}', num(on.length), num(totalN))}
                >
                  {onMissing.length > 0 && (
                    <p className={s.warnNote} role="alert">
                      {tr('{0} давхарга татагдсангүй', num(onMissing.length))}{' '}
                      <button type="button" className={s.zoneBarBtn} onClick={retryTotals}>{tr('Дахин оролдох')}</button>
                    </p>
                  )}
                  <div
                    className={pickedGroups.length > 1 ? s.pickedGrid : s.cardGrid}
                    style={pickedGroups.length > 1 ? undefined : gridStyle(pickedGroups.length)}
                  >
                    {pickedGroups.map(({ g, ids, n, donut, series, faceted }) => (
                      <GroupCard
                        key={g.key}
                        g={g}
                        ids={ids}
                        map={map}
                        on
                        wide={pickedGroups.length <= CARD_WIDE_MAX}
                      >
                        {donut.length > 1 && (
                          <div className={s.chartBlock}>
                            <Donut
                              items={donut}
                              center={num(n)}
                              selected={on.length === 1 ? on[0] : null}
                              onSelect={isolate}
                            />
                          </div>
                        )}

                        {series.map((c) => (
                          <div key={c.geom} className={s.chartBlock}>
                            <div className={s.facetHead}>
                              {c.title}
                              <span className={s.facetNote}>
                                {c.geom === 'point' || c.geom === 'other' ? num(c.sum)
                                  : c.geom === 'area' ? haText(c.sum) : kmText(c.sum)}
                              </span>
                            </div>
                            <Bars
                              items={c.items}
                              limit={8}
                              inline
                              selected={on.length === 1 ? on[0] : null}
                              onSelect={isolate}
                            />
                          </div>
                        ))}

                        {/* Давхарга бүрийн ДОТООД төрлүүд — өөрийн чартаар */}
                        {faceted.map(({ d, f }) => (
                          <LayerTypeCharts key={`${d.id}:${f.field}`} d={d} f={f} zone={zone} view={view} />
                        ))}
                      </GroupCard>
                    ))}
                  </div>
                </Section>

                {zonelessList}

                <Section>
                  <button
                    type="button"
                    className={s.zoomBtn}
                    onClick={() => setVisible(VIEW_BY_KEY.plan.initial.slice())}
                  >
                    {tr('Сонголтыг цуцлах · ерөнхий тойм руу')}
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
 */
function LayerTypeCharts({
  d, f, zone, view,
}: {
  d: LayerDef;
  f: { field: string; label: string; canon?: (raw: string) => string };
  zone: string | null;
  view: ViewKey;
}) {
  const { toggle, isOn } = useFilter();
  const where = whereFor(d, zone);
  /** Задаргаа нь БҮСЭЭР үү, ангиллаар уу — нэгж үг ба хоосон шошго үүнээс */
  const byZone = f.field === ZONE_FIELD || f.field === ZONE_LAYER.zoneField;

  const q = useAsync(async () => {
    const { rows, truncated } = await queryGroupEx(layerUrl(d), f.field, layerStats(d), where);
    const g = groups(rows, f.field, byZone ? tr('Тодорхойгүй') : tr('Бүртгэгдээгүй'), ['n', 'q']);
    const list = g
      .map((x) => (byZone && x.label.trim() === ZONE_NONE.trim()
        ? { ...x, label: tr('Бүсэд хамаарахгүй') }
        : x))
      .sort((a, b) => b.values.n - a.values.n);
    return { list, truncated };
  }, [d.id, f.field, where]);

  if (q.state === 'error') return <Empty label={tr('Задаргаа татагдсангүй.')} onRetry={q.retry} />;
  if (q.state !== 'ready' || q.data.list.length < 2) return null;
  const data = q.data.list;
  const truncated = q.data.truncated;

  const total = data.reduce((a, x) => a + x.values.n, 0);
  const shade = monoShades(d, data);
  const colorOf = (label: string) => shade.get(label) ?? BLANK_HUE;
  const nameOf = (label: string): string => tr(f.canon
    ? f.canon(label)
    : f.field === d.paint?.field
      ? d.paint.labels?.[label] ?? label
      : label);

  const items = data.map((x) => ({
    key: `${d.id}:${x.label}`,
    label: nameOf(x.label),
    value: x.values.n,
    color: colorOf(x.label),
  }));

  /**
   * Ангилал дарахад зурагт шүүнэ.
   */
  const pickType = (key: string) => {
    const item = data.find((x) => `${d.id}:${x.label}` === key);
    if (!item) return;
    toggle({
      key,
      label: nameOf(item.label),
      group: `${d.title} · ${f.label}`,
      where: groupWhere(f.field, item),
      view,
      layerIds: d.id,
      color: d.hue,
    });
  };
  /** Хэмжээний баганын түлхүүр (`:q:`) — тоонийхтэй нэг шүүлт рүү буулгана */
  const selKey = items.find((it) => isOn(it.key))?.key ?? null;

  /** Хэмжээгээр — «Барилга» дээр төрөл бүрийн талбай, шугамд урт */
  const sized = d.qty
    ? data
      .filter((x) => x.values.q > 0)
      .map((x) => ({
        key: `${d.id}:q:${x.label}`,
        label: nameOf(x.label),
        value: d.qty!.unit === 'м²' ? x.values.q / 10_000 : d.qty!.unit === 'км' ? x.values.q : x.values.q / 1_000,
        display: qtyText(d, x.values.q) ?? '',
        color: colorOf(x.label),
      }))
      .sort((a, b) => b.value - a.value)
    : [];

  return (
    <>
      <div className={s.chartBlock}>
        <div className={s.facetHead}>
          {d.title}
          <span className={s.facetNote}>
            {f.label} · {data.length} {byZone ? tr('бүс') : tr('төрөл')}
            {truncated && <> · <b title={tr('Бүлгийн тоо серверийн хязгаараас хэтэрсэн тул зарим нь орхигдсон.')}>{tr('дутуу')}</b></>}
          </span>
        </div>

        {/* Донат — төрлийн эзлэх хувь. 8-аас олон зүсмэг уншигдахгүй тул багана л үлдэнэ. */}
        {items.length <= 8 && (
          <div style={{ margin: '10px 0 12px' }}>
            <Donut items={items} center={num(total)} centerLabel={tr('ш')} selected={selKey} onSelect={pickType} />
          </div>
        )}

        <Bars
          items={items.map((it) => ({ ...it, display: tr('{0} ш', num(it.value)) }))}
          limit={8}
          inline
          selected={selKey}
          onSelect={pickType}
        />
      </div>

      {sized.length > 1 && (
        <div className={s.chartBlock}>
          <div className={s.facetHead}>
            {d.qty!.unit === 'м²'
              ? (byZone ? tr('Талбай бүсээр') : tr('Талбай төрлөөр'))
              : (byZone ? tr('Урт бүсээр') : tr('Урт төрлөөр'))}
            <span className={s.facetNote}>{qtyText(d, data.reduce((a, x) => a + x.values.q, 0))}</span>
          </div>
          <Bars
            items={sized}
            limit={8}
            inline
            selected={selKey ? `${d.id}:q:${selKey.slice(d.id.length + 1)}` : null}
            onSelect={(k) => pickType(`${d.id}:${k.slice(d.id.length + 3)}`)}
          />
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
 */
function LayerDashboard({
  d,
  zone,
  on,
  toggle,
  onBack,
}: {
  d: LayerDef;
  zone: string | null;
  on: boolean;
  toggle: () => void;
  onBack: () => void;
}) {
  const { setHighlight, zoomToLayer, zoomToWhere, highlight } = useMap();
  const [sel, setSel] = useState<string | null>(null);
  const selRef = useRef(sel);
  useSyncRef(selRef, sel);
  const hlRef = useRef(highlight);
  useSyncRef(hlRef, highlight);
  const idRef = useRef(d.id);
  useSyncRef(idRef, d.id);
  useEffect(() => () => { if (selRef.current != null && ownsHighlight(hlRef.current, idRef.current)) setHighlight(null); }, [setHighlight]);
  useEffect(() => {
    if (sel != null && !ownsHighlight(highlight, d.id)) setSel(null);
  }, [highlight, sel, d.id]);
  const selKey = `${d.id}|${zone ?? ''}`;
  const prevLayerRef = useRef(selKey);
  useEffect(() => {
    if (prevLayerRef.current === selKey) return;
    prevLayerRef.current = selKey;
    if (selRef.current != null) {
      setSel(null);
      setHighlight(null);
    }
  }, [selKey, setHighlight]);
  const where = whereFor(d, zone);
  const g = groupOf(d.id);
  const groupTitle = LAYER_GROUPS.find((x) => x.key === g)?.title ?? '';

  const q = useAsync(async () => {
    const url = layerUrl(d);
    const stats = layerStats(d);
    const KEYS = ['n', 'q'];

    const [facetRaw, zoneRaw] = await Promise.all([
      Promise.all((d.facets ?? []).map((f) => queryGroupEx(url, f.field, stats, where))),
      d.noZone || zone ? Promise.resolve(null) : queryGroupEx(url, d.zoneField ?? ZONE_FIELD, stats, where),
    ]);

    const facets = (d.facets ?? []).map((f, i) => ({
      ...f,
      items: groups(facetRaw[i].rows, f.field, tr('Бүртгэгдээгүй'), KEYS),
      truncated: facetRaw[i].truncated,
    }));

    const byZone = zoneRaw
      ? groups(zoneRaw.rows, d.zoneField ?? ZONE_FIELD, tr('Тодорхойгүй'), KEYS)
        .filter((x) => x.label.trim() !== ZONE_NONE.trim())
        .sort((a, b) => b.values.n - a.values.n)
      : null;

    return { facets, byZone, zoneTruncated: !!zoneRaw?.truncated };
  }, [d.id, where]);

  const pick = (key: string, w: string | null) => {
    const next = sel === key ? null : key;
    setSel(next);
    setHighlight(next ? w : null, d.id);
  };

  /** Ангиллын нэг чартын сонголт — донат ба багана хоёулаа үүгээр дамжина */
  const pickFacet = (f: { field: string; label: string; items: Group[] }) => (k: string) => {
    const item = f.items.find((y) => `${f.label}:${y.label}` === k);
    pick(k, item ? groupWhere(f.field, item) : null);
  };

  const one = useLazyTotals(zone, [d.id]);
  const t = one.map.get(d.id);
  const qty = t ? qtyText(d, t.q) : null;

  /**
   * Нэг объектод ногдох дундаж хэмжээ (шугам → м, талбай → м²).
   */
  const avg = d.qty ? avgQty(t) : null;
  const zoomWhere = zoomWhereFor(d, zone);

  return (
    <div style={{ '--tone': 'var(--hue)' } as CSSProperties}>
      <div className={s.crumb}>
        <button type="button" className={s.crumbBack} onClick={onBack}>{tr('‹ Жагсаалт')}</button>
        {groupTitle && <span className={s.crumbGroup}>{groupTitle}</span>}
      </div>

      <Section>
        <div className={s.headRow}>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={tr('{0} — зурагт харуулах', d.title)}
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
              {!on && tr(' · зурагт нуугдсан')}
            </p>
          </div>
        </div>

        {one.failed.length > 0 ? (
          <Empty label={tr('Үзүүлэлт татагдсангүй.')} onRetry={retryTotals} />
        ) : (
          <Stats cols={avg != null ? 3 : 2}>
            <Stat value={t ? num(t.n) : '…'} unit={tr('ш')} label={tr('Тоо')} accent />
            <Stat value={qty ?? '—'} label={d.qty?.unit === 'м²' ? tr('Талбай') : tr('Урт')} />
            {avg != null && (
              <Stat
                value={num(avg, 1)}
                unit={tr(d.qty!.unit)}
                label={tr('Дундаж {0}', d.qty!.unit === 'м²' ? tr('талбай') : tr('урт'))}
              />
            )}
          </Stats>
        )}

        {zone && d.noZone && (
          <p className={s.warnNote}>
            {tr('Энэ давхаргад')} <b>ZONE_ID</b> {tr('талбар байхгүй тул «')}{zone}{tr('» бүсийн шүүлт үйлчлээгүй — дүн нь төслийн бүхэлдээ.')}
          </p>
        )}

        <button type="button" className={s.zoomBtn}
          onClick={() => (zoomWhere ? zoomToWhere(d.id, zoomWhere) : zoomToLayer(d.id))}>
          {tr('Зурагт төвлөрөх')}
        </button>
      </Section>

      <Data q={q} loading={tr('Задаргаа тооцож байна…')}>
        {(x) => {
          const facets = x.facets.filter((f) => f.items.length >= 2);
          const hasZone = x.byZone && x.byZone.length > 1;

          return (
            <>
              {/* ── Ангилал бүрээр — ЭХНИЙ ангиллыг дугаар диаграмаар (дашбоард төрх) ── */}
              {facets.map((f, idx) => {
                const shade = monoShades(d, f.items);
                const total = f.items.reduce((a, i) => a + i.values.n, 0);
                const items = f.items.map((item) => ({
                  key: `${f.label}:${item.label}`,
                  label: facetName(d, f.field, item.label),
                  value: item.values.n,
                  display: [
                    `${num(item.values.n)}`,
                    qtyText(d, item.stats.q ?? null),
                  ].filter(Boolean).join(' · '),
                  color: shade.get(item.label) ?? BLANK_HUE,
                }));
                return (
                  <Section
                    key={f.label}
                    title={f.label}
                    note={tr('{0} ангилал · дарж зурагт шүүнэ', f.items.length) + (f.truncated ? ` · ${tr('дутуу')}` : '')}
                  >
                    {/* Эхний ангиллыг дугуй диаграмаар — эзлэх хувийг нэг дор */}
                    {idx === 0 && f.items.length <= 8 && (
                      <div style={{ marginBottom: 14 }}>
                        <Donut
                          items={items.map((it) => ({ key: it.key, label: it.label, value: it.value, color: it.color }))}
                          center={num(total)}
                          selected={sel}
                          onSelect={pickFacet(f)}
                        />
                      </div>
                    )}
                    <Bars
                      color={d.hue}
                      limit={8}
                      selected={sel}
                      onSelect={pickFacet(f)}
                      items={items}
                    />
                  </Section>
                );
              })}

              {/* ── Бүсээр ── */}
              {hasZone && (
                <Section
                  title={tr('Бүсээр')}
                  note={tr('{0} бүс · дарж зурагт шүүнэ', x.byZone!.length) + (x.zoneTruncated ? ` · ${tr('дутуу')}` : '')}
                >
                  <Bars
                    color={d.hue}
                    limit={8}
                    selected={sel}
                    onSelect={(k) => {
                      const item = x.byZone!.find((y) => `бүс:${y.label}` === k);
                      pick(k, item ? groupWhere(d.zoneField ?? ZONE_FIELD, item) : null);
                    }}
                    items={x.byZone!.map((item) => ({
                      key: `бүс:${item.label}`,
                      label: item.label,
                      value: item.values.n,
                      display: [
                        `${num(item.values.n)}`,
                        qtyText(d, item.stats.q ?? null),
                      ].filter(Boolean).join(' · '),
                    }))}
                  />
                </Section>
              )}

              {!facets.length && !hasZone && (
                <Section>
                  <Empty label={tr('Энэ давхаргад задлах ангилал бүртгэгдээгүй.')} />
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

/* ═════════════════ Барилгын хяналт ═════════════════ */

/* ═════════════════ Сонгосон бүс ═════════════════ */

function PickedZone({
  attrs, zone, setZone,
}: {
  attrs: Record<string, unknown>;
  zone: string | null;
  setZone: (z: string | null) => void;
}) {
  const F = ZONE_FIELDS;
  const id = zoneCanon(attrs[F.id]);
  const type = zoneType(attrs[F.type]);
  const { setHighlight, highlight } = useMap();
  /** Барилгын төлөв дарахад — тэр бүсийн тийм төлөвтэй барилгуудыг тодруулна */
  const [selSt, setSelSt] = useState<string | null>(null);
  const selStRef = useRef(selSt);
  useSyncRef(selStRef, selSt);
  const hlRef = useRef(highlight);
  useSyncRef(hlRef, highlight);
  useEffect(() => () => { if (selStRef.current != null && ownsHighlight(hlRef.current, BUILT_LAYER.id)) setHighlight(null); }, [setHighlight]);
  useEffect(() => {
    if (selSt != null && !ownsHighlight(highlight, BUILT_LAYER.id)) setSelSt(null);
  }, [highlight, selSt]);
  const prevIdRef = useRef(id);
  useEffect(() => {
    if (prevIdRef.current === id) return;
    prevIdRef.current = id;
    if (selStRef.current != null) {
      setSelSt(null);
      setHighlight(null);
    }
  }, [id, setHighlight]);
  const pickStatus = (v: string, where?: string | null) => {
    const off = selSt === v;
    setSelSt(off ? null : v);
    if (off) { setHighlight(null); return; }
    const zw = zoneWhere(BUILT_LAYER, id);
    const cond = where ?? `${BUILT_FIELDS.status} = ${sqlStr(v)}`;
    setHighlight(`${zw ? `(${zw}) AND ` : ''}(${cond})`, BUILT_LAYER.id);
  };

  const q = useAsync(async () => {
    const B = BUILT_FIELDS;
    const where = zoneWhere(BUILT_LAYER, id) ?? '1=1';
    const byStatus = await queryGroup(layerUrl(BUILT_LAYER), B.status, [
      count(oidOf(BUILT_LAYER), 'n'), sum(B.households, 'urh'), sum(POPULATION_FIELD, 'pop'),
    ], where);
    const rows = groups(byStatus, B.status, tr('Тодорхойгүй'), ['n', 'urh', 'pop']);
    const status = BUILT_STATUS.map((st) => {
      const g = rows.find((r) => r.label === st.value);
      return { ...st, n: g?.values.n ?? 0, urh: g?.values.urh ?? 0, pop: g?.values.pop ?? 0 };
    });
    const known = new Set(BUILT_STATUS.map((st) => st.value));
    const extra = rows
      .filter((r) => !known.has(r.label) && r.values.n > 0)
      .map((r) => ({ label: r.label, n: r.values.n, where: groupWhere(B.status, r) }));
    const sumStat = (k: string): number | null => (rows.every((r) => r.stats[k] == null)
      ? null : rows.reduce((a, r) => a + (r.stats[k] ?? 0), 0));
    return {
      status,
      extra,
      built: rows.reduce((a, r) => a + r.values.n, 0),
      urh: sumStat('urh'),
      pop: sumStat('pop'),
    };
  }, [id]);

  const n = (f: string) => {
    const v = attrs[f];
    return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
  };
  if (!id) return null;

  return (
    <Section title={tr('Сонгосон бүс')}>
      <div className={s.zoneHead} style={{ '--tone': ZONE_TYPES[type] ?? ZONE_TYPE_EMPTY_HUE } as CSSProperties}>
        <span className={s.zoneHeadId}>{zoneLabel(id)}</span>
        <span className={s.zoneHeadType}>{tr(type)}</span>
      </div>

      <Stats cols={3}>
        <Stat value={num(n(F.landHa), 2)} unit={tr('га')} label={tr('Талбай')} accent />
        <Stat value={num(n(F.households))} unit={tr('айл')} label={tr('Төлөвлөсөн айл')} />
        <Stat value={num(n(F.builtM2) != null ? n(F.builtM2)! / 1000 : null, 0)} unit={tr('мянган м²')} label={tr('Барилгын талбай')} />
      </Stats>

      <div style={{ marginTop: 10 }}>
        <Rows
          items={[
            { key: 'FAR / BCR', value: <span className="num">{num(n(F.far), 2)} / {(() => {
              const b = n(F.bcr);
              return b == null || b === 0 ? '—' : `${num(b <= 1.5 ? b * 100 : b, 0)}%`;
            })()}</span> },
            { key: tr('Зогсоол (норм / төлөвлөсөн)'), value: <span className="num">{num(n(F.parkNorm))} / {num(n(F.parkPlanOpen) == null && n(F.parkPlanUnder) == null ? null : (n(F.parkPlanOpen) ?? 0) + (n(F.parkPlanUnder) ?? 0))}</span> },
            ...(n(F.landPending) ? [{ key: tr('Газар чөлөөлөлт'), value: tr('дуусаагүй') }] : []),
          ]}
        />
      </div>

      <Data q={q} loading={tr('Бүсийн барилга…')}>
        {(x) => x.built === 0 ? null : (
          <div style={{ marginTop: 16 }}>
            <div className={s.facetHead}>
              {tr('Барилга')} <span className={s.facetNote}>{num(x.built)} {tr('ш ·')} {num(x.urh)} {tr('өрх ·')} {num(x.pop)} {tr('хүн')}</span>
            </div>
            <Bars
              selected={selSt}
              onSelect={(k) => pickStatus(k, x.extra.find((e) => `~${e.label}` === k)?.where ?? null)}
              items={[
                ...x.status.map((st, i) => ({
                  key: st.value, label: st.value, value: st.n,
                  // НЭГ ӨНГӨ (барилгын давхаргын hue) тодоос бүдгэр — солонго биш
                  display: `${num(st.n)}`, color: shade(LAYER_BY_ID['et:24']?.hue ?? '#f59e0b', i, x.status.length),
                })),
                ...x.extra.map((e) => ({
                  key: `~${e.label}`, label: e.label, value: e.n, display: `${num(e.n)}`, color: 'var(--ink-3)',
                })),
              ]}
            />
          </div>
        )}
      </Data>

      {zone !== id && (
        <button type="button" className={s.zoomBtn} onClick={() => setZone(id)}>
          {tr('Энэ бүсээр бүгдийг шүүх')}
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
  const { setHighlight, highlight } = useMap();
  const [active, setActive] = useState<string | null>(null);
  const activeRef = useRef(active);
  useSyncRef(activeRef, active);
  const hlRef = useRef(highlight);
  useSyncRef(hlRef, highlight);
  const idRef = useRef(def.id);
  useSyncRef(idRef, def.id);
  useEffect(() => () => { if (activeRef.current != null && ownsHighlight(hlRef.current, idRef.current)) setHighlight(null); }, [setHighlight]);
  useEffect(() => {
    if (active != null && !ownsHighlight(highlight, def.id)) setActive(null);
  }, [highlight, active, def.id]);
  const prevAttrsRef = useRef(attrs);
  useEffect(() => {
    if (prevAttrsRef.current === attrs) return;
    prevAttrsRef.current = attrs;
    if (activeRef.current != null) {
      setActive(null);
      setHighlight(null);
    }
  }, [attrs, setHighlight]);

  const zoneId = text(attrs[ZONE_FIELD], '').trim();
  const hasZone = zoneId !== '' && zoneId !== ZONE_NONE.trim();

  const rows: { key: string; value: React.ReactNode }[] = [];
  if (def.qty && attrs[def.qty.field] != null) {
    rows.push({
      key: def.qty.unit === 'м²' ? tr('Талбай') : tr('Урт'),
      value: <span className="num">{num(Number(attrs[def.qty.field]), 1)} {tr(def.qty.unit)}</span>,
    });
  }
  if (def.id === BUILT_LAYER.id) {
    for (const [f, label] of [
      [BUILT_FIELDS.floors, tr('Давхар')],
      [BUILT_FIELDS.households, tr('Өрхийн тоо')],
      [POPULATION_FIELD, tr('Хүн ам')],
    ] as [string, string][]) {
      if (attrs[f] == null) continue;
      rows.push({ key: label, value: <span className="num">{num(Number(attrs[f]))}</span> });
    }
  }
  // Газар чөлөөлөлтийн кадастрын мэдээлэл — эзэмшигч, хаяг, дугаар, тэмдэглэл.
  if (def.id === 'land:left') {
    const F = PARCEL_LEFT.fields;
    for (const [f, label] of [
      [F.parcelNo, tr('Нэгж талбарын №')],
      [F.owner, tr('Эзэмшигч')],
      [F.address, tr('Хаяг')],
      [F.note, tr('Тайлбар')],
    ] as [string, string][]) {
      const v = text(attrs[f], '').trim();
      if (v) rows.push({ key: label, value: v });
    }
  }

  const filters = (def.facets ?? [])
    .map((f) => ({ ...f, value: attrs[f.field] }))
    .filter((f) => f.value != null && String(f.value).trim() !== '');

  const apply = (field: string, value: unknown) => {
    const k = `${field}:${value}`;
    const next = active === k ? null : k;
    setActive(next);
    setHighlight(next ? `${field} = ${sqlStr(String(value))}` : null, def.id);
  };

  return (
    <Section title={tr('Сонгосон')} note={def.title}>
      {hasZone && (
        <button type="button" className={s.zoneJump} onClick={() => setZone(zoneId)}>
          <span className={s.zoneJumpLabel}>{tr('Бүс')}</span>
          <span className={s.zoneJumpValue}>{zoneId}</span>
          <span className={s.zoneJumpGo}>{tr('шүүх →')}</span>
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
                style={{ '--tone': 'var(--hue)' } as CSSProperties}
                onClick={() => apply(f.field, f.value)}
              >
                <span className={s.filterKey}>{f.label}</span>
                <span className={s.filterVal}>{facetName(def, f.field, text(f.value))}</span>
              </button>
            );
          })}
        </div>
      )}

      {rows.length === 0 && filters.length === 0 && <Empty label={tr('Энэ дээр бүртгэгдсэн талбар алга.')} />}

      <button type="button" className={s.zoomBtn} onClick={onIsolate}>
        {isolated ? tr('Бүх давхаргыг буцааж харуулах') : tr('Зөвхөн «{0}»-г харуулах', def.title)}
      </button>
    </Section>
  );
}
