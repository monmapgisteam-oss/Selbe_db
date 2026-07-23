'use client';

import { useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { Section, Stats, Stat, Bars, Donut, Rows, Data, Empty } from '@/components/ui';
import { LayerSwatch } from '@/components/LayerSwatch';
import { useMap } from '@/components/MapCanvas';
import { useAsync, type Async } from '@/lib/useAsync';
import { queryGroup, count, sum, groups, groupWhere, sqlStr, type Row } from '@/lib/query';
import {
  LAYER_BY_ID, layerUrl, OID, ZONE_FIELD, ZONE_NONE, ZONE_LAYER, ZONE_FIELDS,
  BUILT_LAYER, BUILT_FIELDS, BUILT_STATUS, ZONE_TYPES, ZONE_TYPE_EMPTY_HUE,
  LAYER_GROUPS, GROUP_LAYERS, PLAN_LAYER_IDS, groupOf,
  type LayerDef, type ViewKey,
} from '@/lib/services';
import { whereFor, qtyText, geomText, groupQty, layerStats, type Totals } from '@/lib/totals';
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
            ? <PickedFeature attrs={picked} def={LAYER_BY_ID[pickedLayer]} setZone={setZone} />
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
          onOpen={openCatalog}
        />
      )}
    </>
  );
}

/* ═════════════════ Тойм — багцаар ═════════════════ */

function PlanOverview({
  totals,
  zone,
  visible,
  setVisible,
  setLayer,
  onOpen,
}: {
  totals: Async<Map<string, Totals>>;
  zone: string | null;
  visible: string[];
  setVisible: Dispatch<SetStateAction<string[]>>;
  setLayer: (id: string | null) => void;
  onOpen: () => void;
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
        const totalN = counted.reduce((a, id) => a + (map.get(id)?.n ?? 0), 0);
        const activeN = PLAN_LAYER_IDS.filter((id) => visible.includes(id)).length;

        // Дугуй диаграм — объект багцаар (эзлэх хувь)
        const groupN = (g: (typeof LAYER_GROUPS)[number]) =>
          GROUP_LAYERS[g.key].reduce((a, id) => a + (map.get(id)?.n ?? 0), 0);
        const byGroup = LAYER_GROUPS
          .map((g) => ({ key: g.key, label: g.title, value: groupN(g), color: g.hue }))
          .filter((x) => x.value > 0);

        // Баганан график — хамгийн олон объекттой давхаргууд
        const topLayers = PLAN_LAYER_IDS
          .map((id) => ({ id, d: LAYER_BY_ID[id], n: map.get(id)?.n ?? 0 }))
          .filter((x) => x.d && x.n > 0)
          .sort((a, b) => b.n - a.n)
          .slice(0, 8)
          .map((x) => ({ key: x.id, label: x.d.title, value: x.n, display: `${num(x.n)} ш`, color: x.d.hue }));

        // Багцаар — урт (км) ба талбай (га) тусад нь график болгоно
        const bySize = LAYER_GROUPS
          .map((g) => {
            const q = groupQty(GROUP_LAYERS[g.key], map);
            return { key: g.key, label: g.title, color: g.hue, q };
          })
          .filter((x) => x.q);

        return (
          <>
            {/* ── Индикаторууд ── */}
            <Section title="Ерөнхий үзүүлэлт">
              <Stats cols={3}>
                <Stat value={num(totalN)} unit="ш" label="Нийт объект" accent />
                <Stat value={num(PLAN_LAYER_IDS.length)} label="Давхарга" />
                <Stat value={`${num(activeN)}/${num(PLAN_LAYER_IDS.length)}`} label="Асаалттай" />
              </Stats>
            </Section>

            {/* ── Дугуй диаграм (pie) — объект багцаар ── */}
            {byGroup.length > 0 && (
              <Section title="Объект багцаар" note="эзлэх хувь">
                <Donut items={byGroup} center={num(totalN)} centerLabel="объект" />
              </Section>
            )}

            {/* ── Баганан график — тэргүүлэх давхаргууд ── */}
            {topLayers.length > 0 && (
              <Section title="Тэргүүлэх давхаргууд" note="дарж дэлгэрэнгүйг харна">
                <Bars items={topLayers} limit={8} onSelect={(id) => setLayer(id)} />
              </Section>
            )}

            {/* ── Багцын хэмжээ (урт · талбай) ── */}
            {bySize.length > 0 && (
              <Section title="Багцын хэмжээ" note="урт ба талбай">
                <div className={s.ovSizeList}>
                  {bySize.map((x) => (
                    <div key={x.key} className={s.ovSizeRow} style={{ '--tone': x.color } as CSSProperties}>
                      <span className={s.ovSizeDot} />
                      <span className={s.ovSizeName}>{x.label}</span>
                      <span className={`${s.ovSizeVal} num`}>{x.q}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        );
      }}
    </Data>
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
            <Stat value={t ? num(t.n) : '…'} unit="ш" label="Объект" accent />
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
                    `${num(item.values.n)} ш`,
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
                          centerLabel="объект"
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
                        `${num(item.values.n)} ш`,
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
                display: `${num(st.n)} ш`, color: st.hue,
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
  attrs, def, setZone,
}: {
  attrs: Record<string, unknown>;
  def: LayerDef;
  setZone: (z: string | null) => void;
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
    <Section title="Сонгосон объект" note={def.title}>
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

      {rows.length === 0 && filters.length === 0 && <Empty label="Энэ объектод бүртгэгдсэн талбар алга." />}
    </Section>
  );
}
