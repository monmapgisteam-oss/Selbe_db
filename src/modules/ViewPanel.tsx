'use client';

import { useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { Section, Stats, Stat, Bars, Rows, Data, Empty } from '@/components/ui';
import { useMap } from '@/components/MapCanvas';
import { useAsync } from '@/lib/useAsync';
import { queryGroup, queryStats, count, sum, groups, groupWhere, sqlStr } from '@/lib/query';
import {
  LAYER_BY_ID, layerUrl, OID, ZONE_FIELD, ZONE_NONE, ZONE_LAYER, ZONE_FIELDS,
  BUILT_LAYER, BUILT_FIELDS, BUILT_STATUS, ZONE_TYPES, ZONE_TYPE_EMPTY_HUE,
  VIEW_BY_KEY, type LayerDef, type ViewKey,
} from '@/lib/services';
import { num, mnt, mntShort, ha, km, text } from '@/lib/format';
import { BuildingSummary, BuildingWork } from './BuildingPanel';
import { SurveySummary, SurveyReports, SurveyOutside, useSurvey, useOutside } from './SurveyPanel';
import s from './dashboard.module.css';

/* ═════════════════ Тооцоо ═════════════════ */

/**
 * Давхаргын тоо, хэмжээ, ӨРТГИЙГ нэг хүсэлтээр.
 *
 * ⚠️ Нэгж үнээр БҮЛЭГЛЭЖ асуудаг нь санаатай. Ихэнх давхаргад нэгж үнэ тогтмол
 * боловч зарим давхаргад ангилал бүрт өөр байдаг (жишээ нь «Инженерийн бэлтгэл
 * арга хэмжээ» 18–250 сая). Нэг ижил хэлбэрээр бүлэглэвэл тэр онцгой тохиолдол
 * өөрөө шийдэгдэнэ — `MAX(үнэ)` авбал тэр давхаргын өртөг 9 дахин хэтэрдэг байв.
 */
async function layerTotals(d: LayerDef, where: string) {
  const url = layerUrl(d);
  // ⚠️ OID нь давхарга бүрт ижил БИШ (хуучин үйлчилгээнүүд `FID`, `objectid`)
  const stats = [count(d.oid ?? OID, 'n'), ...(d.qty ? [sum(d.qty.field, 'q')] : [])];

  if (!d.cost) {
    const r = await queryStats(url, stats, where);
    return { n: Number(r.n ?? 0), q: Number(r.q ?? 0), cost: 0 };
  }

  const rows = await queryGroup(url, d.cost.field, stats, where);
  let n = 0, q = 0, cost = 0;
  for (const r of rows) {
    const price = Number(r[d.cost.field] ?? 0);
    const rn = Number(r.n ?? 0);
    const rq = Number(r.q ?? 0);
    n += rn;
    q += rq;
    cost +=
      d.cost.basis === 'sh' ? rn * price
        : d.cost.basis === 'm100' ? (rq / 100) * price
          : rq * price; // 'km' ба 'm2' — хэмжээ шууд үржигдэнэ
  }
  return { n, q, cost };
}

const qtyText = (d: LayerDef, q: number): string | null => {
  if (!d.qty || q <= 0) return null;
  if (d.qty.unit === 'км') return `${num(q, 1)} км`;
  if (d.qty.unit === 'м') return `${km(q, 1)} км`;
  return `${ha(q, 1)} га`;
};

const zoneWhere = (zone: string | null) => (zone ? `${ZONE_FIELD} = ${sqlStr(zone)}` : '1=1');

/* ═════════════════ Үндсэн самбар ═════════════════ */

/**
 * ⚠️ ШАТЛАЛГҮЙ. Урьд нь тойм → дэлгэрэнгүй → «буцах» гэсэн навигацитай байсан
 * тул хэрэглэгч хаана байгаагаа алддаг байв. Одоо бүх зүйл НЭГ хуудсанд: давхарга
 * бүр өөрийн мөртэй, дарахад задаргаа нь ЯГ ТЭНД задарна.
 */
export function ViewPanel({
  view,
  visible,
  setVisible,
  zone,
  setZone,
  picked,
  pickedLayer,
}: {
  view: ViewKey;
  visible: string[];
  setVisible: Dispatch<SetStateAction<string[]>>;
  zone: string | null;
  setZone: (z: string | null) => void;
  picked: Record<string, unknown> | null;
  pickedLayer: string | null;
}) {
  const v = VIEW_BY_KEY[view];

  // Барилгын хяналт нь өөрийн бэспок самбартай (16 үе шат, тайлангийн хүснэгтүүд)
  if (view === 'monitor') {
    return <MonitorPanel picked={picked} pickedLayer={pickedLayer} />;
  }

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

      <LayerList ids={v.layers} visible={visible} setVisible={setVisible} zone={zone} />
    </>
  );
}

/* ═════════════════ Давхаргын жагсаалт ═════════════════ */

function LayerList({
  ids,
  visible,
  setVisible,
  zone,
}: {
  ids: string[];
  visible: string[];
  setVisible: Dispatch<SetStateAction<string[]>>;
  zone: string | null;
}) {
  const key = `${ids.join(',')}|${zone ?? ''}`;
  const q = useAsync(async () => {
    const rows = await Promise.all(
      ids.map(async (id) => {
        const d = LAYER_BY_ID[id];
        // ⚠️ ZONE_ID-гүй давхаргад бүсийн шүүлт хийвэл хүсэлт унана
        const t = await layerTotals(d, d.noZone ? '1=1' : zoneWhere(zone));
        return { d, ...t };
      }),
    );
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <Data q={q} loading="Үзүүлэлт, өртөг тооцож байна…">
      {(rows) => {
        /**
         * ⚠️ Бүс сонгогдсон үед `ZONE_ID`-гүй давхаргыг нийлбэрээс ХАСНА —
         * тэдгээр нь бүсээр шүүгдэх боломжгүй тул төслийн бүх утгаа хэвээр өгнө.
         * Нийлбэрт оруулбал бүсийн дүн бүхэлдээ худал болно.
         */
        const counted = zone ? rows.filter((r) => !r.d.noZone) : rows;
        const totalCost = counted.reduce((a, r) => a + r.cost, 0);
        const totalN = counted.reduce((a, r) => a + r.n, 0);

        return (
          <>
            <Section title="Нийт">
              <Stats cols={2}>
                <Stat value={num(totalN)} unit="ш" label="Объект" accent />
                <Stat
                  value={totalCost > 0 ? mntShort(totalCost) : '—'}
                  unit={totalCost > 0 ? '₮' : undefined}
                  label="Ерөнхий төсөв"
                  accent
                />
              </Stats>
            </Section>

            <Section title="Давхарга" note="дарж задаргааг нь харна">
              <div className={s.rows}>
                {rows.map((r) => (
                  <LayerRow
                    key={r.d.id}
                    d={r.d}
                    n={r.n}
                    qv={r.q}
                    cost={r.cost}
                    zone={zone}
                    on={visible.includes(r.d.id)}
                    toggle={() =>
                      setVisible((prev) =>
                        prev.includes(r.d.id) ? prev.filter((x) => x !== r.d.id) : [...prev, r.d.id],
                      )
                    }
                  />
                ))}
              </div>
            </Section>
          </>
        );
      }}
    </Data>
  );
}

/**
 * Нэг давхаргын мөр — чагт + тоо + БАЙРАНДАА задардаг задаргаа.
 *
 * ⚠️ Задаргааг нээхэд өөр хуудас руу шилжихгүй. Урьд нь тусдаа «дэлгэрэнгүй»
 * дэлгэц рүү ордог байсан тул буцаж ирээд хаана байснаа олох хэрэгтэй болдог байв.
 */
function LayerRow({
  d, n, qv, cost, zone, on, toggle,
}: {
  d: LayerDef;
  n: number;
  qv: number;
  cost: number;
  zone: string | null;
  on: boolean;
  toggle: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`${s.row} ${on ? s.rowOn : ''}`} style={{ '--tone': d.hue } as CSSProperties}>
      <div className={s.rowHead}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${d.title} — зурагт харуулах`}
          className={s.check}
          onClick={toggle}
        >
          <svg viewBox="0 0 12 12" width="10" height="10">
            <path d="M2 6.2 4.6 8.8 10 3.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button type="button" aria-expanded={open} className={s.rowMain} onClick={() => setOpen((x) => !x)}>
          <span className={s.rowTitle}>{d.title}</span>
          <span className={`${s.rowValue} num`}>
            {num(n)} ш
            {qtyText(d, qv) ? ` · ${qtyText(d, qv)}` : ''}
            {zone && d.noZone && <em className={s.rowWarn}> · бүсээр шүүгдээгүй</em>}
          </span>
        </button>

        {cost > 0 && <span className={`${s.rowCost} num`}>{mntShort(cost)}</span>}
        <span className={`${s.caret} ${open ? s.caretOpen : ''}`} aria-hidden>▾</span>
      </div>

      {open && <LayerBreakdown d={d} cost={cost} zone={zone} />}
    </div>
  );
}

/** Давхаргын задаргаа — ангилал ба бүсээр. Дарахад газрын зурагт шүүнэ. */
function LayerBreakdown({ d, cost, zone }: { d: LayerDef; cost: number; zone: string | null }) {
  const { setHighlight, zoomToLayer } = useMap();
  const [sel, setSel] = useState<string | null>(null);
  const where = d.noZone ? '1=1' : zoneWhere(zone);

  const q = useAsync(async () => {
    const fs = await Promise.all([
      ...(d.facets ?? []).map((f) =>
        queryGroup(layerUrl(d), f.field, [count(d.oid ?? OID, 'n')], where),
      ),
      ...(d.noZone || zone ? [] : [queryGroup(layerUrl(d), ZONE_FIELD, [count(d.oid ?? OID, 'n')], where)]),
    ]);
    const facets = (d.facets ?? []).map((f, i) => ({
      ...f,
      items: groups(fs[i], f.field, 'Бүртгэгдээгүй', ['n']),
    }));
    const byZone = d.noZone || zone
      ? null
      : groups(fs[(d.facets ?? []).length], ZONE_FIELD, 'Тодорхойгүй', ['n'])
        .filter((g) => g.label.trim() !== ZONE_NONE.trim())
        .sort((a, b) => b.values.n - a.values.n);
    return { facets, byZone };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id, where]);

  const pick = (key: string, w: string | null) => {
    const next = sel === key ? null : key;
    setSel(next);
    setHighlight(next ? w : null);
  };

  return (
    <div className={s.rowBody}>
      {cost > 0 && (
        <Rows
          items={[
            { key: 'Ерөнхий төсөв', value: <b className="num" style={{ color: d.hue }}>{mnt(cost)}</b> },
            { key: 'Нэгж үнэ', value: <span className="num">{costNote(d)}</span> },
          ]}
        />
      )}

      <button type="button" className={s.zoomBtn} onClick={() => zoomToLayer(d.id)}>
        Зурагт төвлөрөх
      </button>

      <Data q={q}>
        {(x) => (
          <>
            {x.facets.map((f) =>
              f.items.length < 2 ? null : (
                <div key={f.label} style={{ marginTop: 14 }}>
                  <div className={s.facetHead}>
                    {f.label} <span className={s.facetNote}>дарж зурагт шүүнэ</span>
                  </div>
                  <Bars
                    color={d.hue}
                    limit={8}
                    selected={sel}
                    onSelect={(k) => {
                      const g = f.items.find((y) => `${f.label}:${y.label}` === k);
                      pick(k, g ? groupWhere(f.field, g) : null);
                    }}
                    items={f.items.map((g) => ({
                      key: `${f.label}:${g.label}`,
                      label: g.label,
                      value: g.values.n,
                      display: `${num(g.values.n)} ш`,
                      color: d.paint?.field === f.field ? d.paint.values[g.label] : undefined,
                    }))}
                  />
                </div>
              ),
            )}

            {x.byZone && x.byZone.length > 1 && (
              <div style={{ marginTop: 14 }}>
                <div className={s.facetHead}>
                  Бүсээр <span className={s.facetNote}>{x.byZone.length} бүс</span>
                </div>
                <Bars
                  color={d.hue}
                  limit={8}
                  selected={sel}
                  onSelect={(k) => {
                    const g = x.byZone!.find((y) => `бүс:${y.label}` === k);
                    pick(k, g ? groupWhere(ZONE_FIELD, g) : null);
                  }}
                  items={x.byZone.map((g) => ({
                    key: `бүс:${g.label}`,
                    label: g.label,
                    value: g.values.n,
                    display: `${num(g.values.n)} ш`,
                  }))}
                />
              </div>
            )}
          </>
        )}
      </Data>
    </div>
  );
}

function costNote(d: LayerDef): string {
  if (!d.cost) return '—';
  return d.cost.basis === 'sh' ? '1 ш тутамд'
    : d.cost.basis === 'm100' ? '100 м тутамд'
      : d.cost.basis === 'km' ? '1 км тутамд' : '1 м² тутамд';
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
      <BuildingWork picked={picked} pickedLayer={pickedLayer} />
      <BuildingSummary />
      <SurveySummary />
      <SurveyReports
        q={survey}
        pickedId={pickedLayer === 'mon:survey' && picked ? String(picked.globalid ?? '') : null}
      />
      <SurveyOutside q={outside} />
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
            ...(budget > 0 ? [{ key: 'Батлагдсан төсөв', value: <b className="num">{mnt(budget)}</b> }] : []),
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
  if (def.cost && attrs[def.cost.field] != null) {
    rows.push({
      key: `Нэгж үнэ · ${costNote(def)}`,
      value: <span className="num">{mnt(Number(attrs[def.cost.field]))}</span>,
    });
  }
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
