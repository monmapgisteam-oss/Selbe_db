'use client';

/**
 * ЕРӨНХИЙ ДАШБОАРД — газрын зургийг ДӨРВӨН талаас диаграмаар хүрээлсэн дэлгэц.
 *
 * ⚠️ Бүх карт ӨӨРИЙН хүсэлтээ явуулна (нэг урт багана БИШ): элемент бүр
 * дэлгэцийг тойрсон бүтцэд байрлана — дээд KPI мөр, зүүн/баруун картууд, доод
 * картууд, гол дунд газрын зураг.
 */

import { type CSSProperties, type ReactNode } from 'react';
import { MapCanvas, type Dim } from '@/components/MapCanvas';
import { Donut, Ring, Bars, Data } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import {
  queryStats, queryGroup, queryFeatures, count, sum, avg, groups,
} from '@/lib/query';
import {
  ZONE_LAYER, BUILT_LAYER, BUILT_FIELDS, ZONE_FIELDS, ZONE_TYPES, ZONE_TYPE_EMPTY_HUE,
  BUILT_STATUS, BUILDING, SURVEY, STAGE_NA, PROJECT_AREA_HA, layerUrl, OID,
} from '@/lib/services';
import { num, pct } from '@/lib/format';
import s from './dashview.module.css';

const HAS_PROGRESS = `${BUILDING.fields.progress} >= ${STAGE_NA + 1}`;

/** Илэрсэн асуудлын нөлөөллийн зэрэг → өнгө */
const IMPACT: Record<string, { label: string; color: string }> = {
  bag: { label: 'Бага', color: 'var(--good)' },
  dund: { label: 'Дунд', color: 'var(--warn)' },
  undur: { label: 'Өндөр', color: 'var(--bad)' },
};

/* ══════════════════ Картын хүрээ ══════════════════ */

function Card({
  title, note, area, children,
}: {
  title: string;
  note?: string;
  /** grid-area (зөвхөн зүүн/баруун баганад биш, доод мөрөнд хэрэггүй) */
  area?: string;
  children: ReactNode;
}) {
  return (
    <section className={s.card} style={area ? ({ gridArea: area } as CSSProperties) : undefined}>
      <header className={s.cardHead}>
        <h3 className={s.cardTitle}>{title}</h3>
        {note && <span className={s.cardNote}>{note}</span>}
      </header>
      <div className={s.cardBody}>{children}</div>
    </section>
  );
}

/* ══════════════════ KPI мөр ══════════════════ */

function Kpis() {
  const q = useAsync(async () => {
    const B = BUILT_FIELDS;
    const Z = ZONE_FIELDS;
    const [zones, built, prog] = await Promise.all([
      queryStats(layerUrl(ZONE_LAYER), [count(OID, 'n')]),
      queryStats(layerUrl(BUILT_LAYER), [
        count(OID, 'n'), sum(B.population, 'pop'), sum(B.households, 'urh'),
        sum(B.usable, 'area'),
      ]),
      queryStats(BUILDING.url, [avg(BUILDING.fields.progress, 'g')], HAS_PROGRESS),
    ]);
    return {
      zones: Number(zones.n ?? 0),
      built: Number(built.n ?? 0),
      pop: Number(built.pop ?? 0),
      urh: Number(built.urh ?? 0),
      areaHa: Number(built.area ?? 0) / 10_000,
      progress: Number(prog.g ?? 0),
    };
  }, []);

  const items = q.state === 'ready'
    ? [
      { v: num(q.data.zones), l: 'Бүс', hue: '#0d9488' },
      { v: num(q.data.built), l: 'Барилга', hue: '#3387b8' },
      { v: num(q.data.pop), l: 'Хүн ам', hue: '#7c3aed' },
      { v: num(q.data.urh), l: 'Өрх', hue: '#0891b2' },
      { v: num(q.data.areaHa, 0), u: 'га', l: 'Барилгын талбай', hue: '#22c55e' },
      { v: pct(q.data.progress, 0), l: 'Дундаж гүйцэтгэл', hue: '#ea580c' },
    ]
    : [];

  return (
    <div className={s.kpi}>
      {q.state !== 'ready'
        ? Array.from({ length: 6 }, (_, i) => <div key={i} className={s.kpiCard} style={{ '--tone': '#334155' } as CSSProperties} />)
        : items.map((i) => (
          <div key={i.l} className={s.kpiCard} style={{ '--tone': i.hue } as CSSProperties}>
            <div>
              <span className={`${s.kpiV} num`}>{i.v}</span>
              {i.u && <span className={s.kpiU}>{i.u}</span>}
            </div>
            <div className={s.kpiL}>{i.l}</div>
          </div>
        ))}
    </div>
  );
}

/* ══════════════════ Зүүн: барилга ══════════════════ */

function BuildingStatusCard() {
  const q = useAsync(async () => {
    const rows = await queryGroup(layerUrl(BUILT_LAYER), BUILT_FIELDS.status, [count(OID, 'n')]);
    const g = groups(rows, BUILT_FIELDS.status, 'Тодорхойгүй', ['n']);
    const hue = Object.fromEntries(BUILT_STATUS.map((x) => [x.value, x.hue]));
    return g.map((x) => ({ key: x.label, label: x.label, value: x.values.n, color: hue[x.label] ?? '#64748b' }));
  }, []);

  return (
    <Card title="Барилгын төлөв" note="эзлэх хувь">
      <Data q={q} loading="…">
        {(items) => <Donut items={items} size={118} width={20} center={num(items.reduce((a, b) => a + b.value, 0))} centerLabel="барилга" />}
      </Data>
    </Card>
  );
}

function BuildingPurposeCard() {
  const q = useAsync(async () => {
    const rows = await queryGroup(layerUrl(BUILT_LAYER), BUILT_FIELDS.purpose, [count(OID, 'n')]);
    return groups(rows, BUILT_FIELDS.purpose, 'Тодорхойгүй', ['n'])
      .slice(0, 6)
      .map((x) => ({ key: x.label, label: x.label, value: x.values.n, display: `${num(x.values.n)} ш`, color: '#3387b8' }));
  }, []);

  return (
    <Card title="Барилгын зориулалт" note="хамгийн олон">
      <Data q={q} loading="…">{(items) => <Bars items={items} />}</Data>
    </Card>
  );
}

/* ══════════════════ Баруун: бүс, зогсоол ══════════════════ */

function ZoneTypeCard() {
  const q = useAsync(async () => {
    const rows = await queryGroup(layerUrl(ZONE_LAYER), ZONE_FIELDS.type, [count(OID, 'n')]);
    return groups(rows, ZONE_FIELDS.type, 'Тодорхойгүй', ['n'])
      .map((x) => ({ key: x.label, label: x.label, value: x.values.n, color: ZONE_TYPES[x.label] ?? ZONE_TYPE_EMPTY_HUE }));
  }, []);

  return (
    <Card title="Бүсийн ангилал" note="эзлэх хувь">
      <Data q={q} loading="…">
        {(items) => <Donut items={items} size={118} width={20} center={num(items.reduce((a, b) => a + b.value, 0))} centerLabel="бүс" />}
      </Data>
    </Card>
  );
}

function ParkingCard() {
  const q = useAsync(async () => {
    const Z = ZONE_FIELDS;
    const r = await queryStats(layerUrl(ZONE_LAYER), [sum(Z.parkNorm, 'norm'), sum(Z.parkPlan, 'plan')]);
    const norm = Number(r.norm ?? 0);
    const plan = Number(r.plan ?? 0);
    return { norm, plan, pctv: norm > 0 ? (plan / norm) * 100 : null };
  }, []);

  return (
    <Card title="Зогсоолын хангамж" note="норм ба төлөвлөсөн">
      <Data q={q} loading="…">
        {(d) => (
          <div className={s.parkRow}>
            <Ring value={d.pctv} color="#eab308" size={92} width={9} />
            <div className={s.parkStats}>
              <div><span>Норм (шаардлага)</span><b className="num">{num(d.norm)}</b></div>
              <div><span>Төлөвлөсөн</span><b className="num">{num(d.plan)}</b></div>
            </div>
          </div>
        )}
      </Data>
    </Card>
  );
}

/* ══════════════════ Доод: гүйцэтгэл, тайлан, асуудал, эрэмбэ ══════════════════ */

function BagtsPerfCard() {
  const F = BUILDING.fields;
  const q = useAsync(async () => {
    const rows = await queryGroup(BUILDING.url, F.bagts, [avg(F.progress, 'g')], HAS_PROGRESS);
    return groups(rows, F.bagts, 'Тодорхойгүй', ['g'])
      .filter((x) => x.label !== 'Тодорхойгүй')
      .sort((a, b) => a.label.localeCompare(b.label, 'mn'))
      .map((x) => ({ key: x.label, label: x.label, value: Math.round(x.values.g), display: `${Math.round(x.values.g)}%`, color: '#ea580c' }));
  }, []);

  return (
    <Card title="Багц тус бүрийн гүйцэтгэл" note="дундаж %">
      <Data q={q} loading="…">{(items) => <Bars items={items} />}</Data>
    </Card>
  );
}

function SurveyStatCard() {
  const F = SURVEY.fields;
  const q = useAsync(async () => {
    const [cnt, tot] = await Promise.all([
      queryStats(SURVEY.url, [count(SURVEY.oid, 'n')]),
      queryStats(SURVEY.url, [sum(F.workers, 'hh'), sum(F.machines, 'th')]),
    ]);
    return {
      reports: Number(cnt.n ?? 0),
      workers: Number(tot.hh ?? 0),
      machines: Number(tot.th ?? 0),
    };
  }, []);

  return (
    <Card title="Талбайн хяналт" note="Survey123">
      <Data q={q} loading="…">
        {(d) => (
          <div className={s.surveyList}>
            <div><b className="num">{num(d.reports)}</b><span>Ирсэн тайлан</span></div>
            <div><b className="num">{num(d.workers)}</b><span>Хүн хүч</span></div>
            <div><b className="num">{num(d.machines)}</b><span>Техник</span></div>
          </div>
        )}
      </Data>
    </Card>
  );
}

function IssuesCard() {
  const q = useAsync(async () => {
    const rows = await queryFeatures(SURVEY.tables.asuudal, { outFields: ['asuudal_noloo'], limit: 500 });
    const by = new Map<string, number>();
    for (const r of rows) {
      const k = String(r.asuudal_noloo ?? '').trim() || 'other';
      by.set(k, (by.get(k) ?? 0) + 1);
    }
    const items = [...by.entries()].map(([k, v]) => ({
      key: k, label: IMPACT[k]?.label ?? 'Тодорхойгүй', value: v, color: IMPACT[k]?.color ?? '#64748b',
    }));
    return { items, total: rows.length };
  }, []);

  return (
    <Card title="Илэрсэн асуудал" note="нөлөөллийн зэргээр">
      <Data q={q} loading="…">
        {(d) => d.items.length
          ? <Donut items={d.items} size={110} width={19} center={num(d.total)} centerLabel="асуудал" />
          : <div className={s.empty}>Асуудал бүртгэгдээгүй</div>}
      </Data>
    </Card>
  );
}

function ZoneDensityCard() {
  const Z = ZONE_FIELDS;
  const q = useAsync(async () => {
    const rows = await queryFeatures(layerUrl(ZONE_LAYER), {
      outFields: [Z.id, Z.type, 'FAR_HUVI', Z.far],
      where: '1=1',
    });
    const zones = rows
      .map((r) => {
        const far = r.FAR_HUVI != null ? Number(r.FAR_HUVI) / 100 : (r[Z.far] != null ? Number(r[Z.far]) : null);
        return { id: String(r[Z.id] ?? '').trim(), type: String(r[Z.type] ?? '—').trim(), far };
      })
      .filter((z) => z.id && z.far != null && Number.isFinite(z.far) && z.far! > 0)
      .sort((a, b) => (b.far ?? 0) - (a.far ?? 0));
    return { top: zones.slice(0, 5), low: [...zones].reverse().slice(0, 5) };
  }, []);

  const col = (list: { id: string; type: string; far: number | null }[]) => (
    <ol className={s.rankList}>
      {list.map((z, i) => (
        <li key={z.id} className={s.rankRow}>
          <span className={s.rankNo}>{i + 1}</span>
          <span className={s.rankMain}>
            <b>{z.id}</b>
            <em>{z.type}</em>
          </span>
          <span className={`${s.rankVal} num`}>{num(z.far, 2)}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <Card title="Бүсийн нягтрал (FAR)" note="хамгийн өндөр · бага">
      <Data q={q} loading="…">
        {(d) => (
          <div className={s.rankCols}>
            <div><div className={s.rankHead}>Хамгийн өндөр</div>{col(d.top)}</div>
            <div><div className={s.rankHead}>Хамгийн бага</div>{col(d.low)}</div>
          </div>
        )}
      </Data>
    </Card>
  );
}

/* ══════════════════ Үндсэн бүрхүүл ══════════════════ */

export function DashboardView({
  dim, setDim, zone, onPick,
}: {
  dim: Dim;
  setDim: (d: Dim) => void;
  zone: string | null;
  onPick: (attrs: Record<string, unknown> | null, layerId: string | null) => void;
}) {
  return (
    <div className={s.frame}>
      {/* ── Дээд: KPI ── */}
      <Kpis />

      {/* ── Зүүн ── */}
      <div className={s.left}>
        <BuildingStatusCard />
        <BuildingPurposeCard />
      </div>

      {/* ── Гол: газрын зураг ── */}
      <div className={s.mapCell}>
        <MapCanvas dim={dim} visible={['et:28', 'et:24']} zone={zone} onPick={onPick} />
        <div className={s.mapDims} role="group" aria-label="Газрын зургийн харагдац">
          {(['2d', '3d', 'bim'] as Dim[]).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dim === d}
              className={`${s.dimBtn} ${dim === d ? s.dimOn : ''}`}
              onClick={() => setDim(d)}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Баруун ── */}
      <div className={s.right}>
        <ZoneTypeCard />
        <ParkingCard />
      </div>

      {/* ── Доод ── */}
      <div className={s.bot}>
        <BagtsPerfCard />
        <SurveyStatCard />
        <IssuesCard />
        <ZoneDensityCard />
      </div>
    </div>
  );
}
