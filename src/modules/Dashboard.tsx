'use client';

import { useCallback, type CSSProperties, type ReactNode } from 'react';
import { MapCanvas, type Dim } from '@/components/MapCanvas';
import { Donut, Bars, Series, Ring, Data } from '@/components/ui';
import { useAsync, type Async } from '@/lib/useAsync';
import { queryStats, queryGroup, count, sum, avg, groups } from '@/lib/query';
import {
  ZONE_LAYER, ZONE_FIELDS, ZONE_TYPES, ZONE_TYPE_EMPTY, ZONE_TYPE_EMPTY_HUE,
  BUILT_LAYER, BUILT_FIELDS, BUILT_STATUS,
  SURVEY, SURVEY_HUE, LAYER_BY_ID, layerUrl, OID,
} from '@/lib/services';
import { num, pct, ha } from '@/lib/format';
import { useBuildings } from './BuildingPanel';
import o from './overview.module.css';

/**
 * ЕРӨНХИЙ ДАШБОАРД — газрын зургийг ТОЙРСОН нэгдсэн үзүүлэлтийн самбар.
 *
 * Байрлал: дээр KPI зурвас, зүүн/баруун талд карт (дугуй диаграм, багана
 * график, индикатор), доор өргөн график — төв дунд газрын зураг.
 *
 * ⚠️ Бүх тоо ArcGIS FeatureServer-ээс ажиллах үедээ ШУУД татагдана — жишиг,
 * зорилтот тоо байхгүй. Асуулга нь порталын бусад хэсэгтэй ИЖИЛ дэд бүтэц
 * (`lib/query.ts`, `lib/services.ts`) ашиглана — дүн зөрөх боломжгүй.
 *
 * ⚠️ Газрын зураг нь порталын нэг `MapCanvas`-ийг ашиглана: 2D/3D/BIM товч,
 * hover мэдээлэл бүгд автоматаар үйлчилнэ. Дашбоард нь бүсийн будалт (TOROL) ба
 * барилгын төлөв (Barilga_ty)-ийг харуулна.
 */

/** Дашбоардын газрын зурагт анхнаасаа асаах давхаргууд */
const DASH_LAYERS = [ZONE_LAYER.id, BUILT_LAYER.id];

/* ══════════════════ Өгөгдөл ══════════════════ */

type Overview = {
  zones: number;
  zonesByType: { label: string; n: number }[];
  buildings: number;
  pop: number;
  households: number;
  usableM2: number;
  buildByStatus: { label: string; n: number }[];
  survey: { count: number; progress: number | null; workers: number; machines: number };
};

/**
 * Ерөнхий тоо — бүс, барилга, талбайн хяналт нэг багц хүсэлтээр.
 * ⚠️ Бүсийн `GAZAR_GA` нийлбэрийг «га талбай»-д АШИГЛАХГҮЙ (эх өгөгдөлд алдаатай
 * бичлэгтэй) — талбайг барилгын ашигтай м²-ээс га болгож харуулна.
 */
function useOverview(): Async<Overview> {
  return useAsync(async () => {
    const Z = ZONE_FIELDS;
    const B = BUILT_FIELDS;
    const S = SURVEY.fields;
    const zoneUrl = layerUrl(ZONE_LAYER);
    const builtUrl = layerUrl(BUILT_LAYER);

    const [zTot, zByType, bTot, bByStatus, surveyTot] = await Promise.all([
      queryStats(zoneUrl, [count(OID, 'n')]),
      queryGroup(zoneUrl, Z.type, [count(OID, 'n')]),
      queryStats(builtUrl, [
        count(OID, 'n'), sum(B.population, 'pop'),
        sum(B.households, 'urh'), sum(B.usable, 'm2'),
      ]),
      queryGroup(builtUrl, B.status, [count(OID, 'n')]),
      queryStats(SURVEY.url, [
        count(SURVEY.oid, 'n'), avg(S.total, 'g'),
        sum(S.workers, 'w'), sum(S.machines, 't'),
      ]),
    ]);

    return {
      zones: Number(zTot.n ?? 0),
      zonesByType: groups(zByType, Z.type, ZONE_TYPE_EMPTY, ['n'])
        .map((g) => ({ label: g.label, n: g.values.n })),
      buildings: Number(bTot.n ?? 0),
      pop: Number(bTot.pop ?? 0),
      households: Number(bTot.urh ?? 0),
      usableM2: Number(bTot.m2 ?? 0),
      buildByStatus: groups(bByStatus, B.status, 'Тодорхойгүй', ['n'])
        .map((g) => ({ label: g.label, n: g.values.n })),
      survey: {
        count: Number(surveyTot.n ?? 0),
        progress: surveyTot.g == null ? null : Number(surveyTot.g),
        workers: Number(surveyTot.w ?? 0),
        machines: Number(surveyTot.t ?? 0),
      },
    };
  }, []);
}

/* ══════════════════ Үндсэн компонент ══════════════════ */

export function Dashboard({ dim, zone }: { dim: Dim; zone: string | null }) {
  const ov = useOverview();
  const bld = useBuildings();
  // Дашбоардын зурагт дарж сонгох үйлдэлгүй — энэ бол зөвхөн тойм харагдац
  const noPick = useCallback(() => {}, []);

  return (
    <div className={o.dash}>
      <div className={o.kpi}>
        <KpiStrip ov={ov} bld={bld} />
      </div>

      <aside className={`${o.side} ${o.left}`}>
        <BuildStatusCard ov={ov} />
        <ProgressCard bld={bld} />
      </aside>

      <div className={o.map}>
        <MapCanvas dim={dim} visible={DASH_LAYERS} zone={zone} onPick={noPick} />
      </div>

      <aside className={`${o.side} ${o.right}`}>
        <ZoneTypeCard ov={ov} />
        <StagesCard bld={bld} />
      </aside>

      <div className={o.bot}>
        <BagtsCard bld={bld} />
        <SurveyCard ov={ov} />
      </div>
    </div>
  );
}

/* ══════════════════ KPI зурвас ══════════════════ */

/**
 * Дээд зурвасын үндсэн үзүүлэлтүүд. `ov` (бүс, барилга) ба `bld` (гүйцэтгэл)
 * хоёр өөр хүсэлтээс уншина — аль нэг нь ачаалагдаагүй бол «…» харуулна.
 */
function KpiStrip({ ov, bld }: { ov: Async<Overview>; bld: ReturnType<typeof useBuildings> }) {
  const d = ov.state === 'ready' ? ov.data : null;
  const b = bld.state === 'ready' ? bld.data : null;
  const err = ov.state === 'error';
  const na = err ? '—' : '…';

  const tiles: { v: string; u?: string; l: string; tone: string }[] = [
    { v: d ? num(d.zones) : na, l: 'Бүс', tone: '#0d9488' },
    { v: d ? num(d.buildings) : na, l: 'Барилга', tone: '#3387b8' },
    { v: d ? num(d.pop) : na, l: 'Хүн ам', tone: '#8b5cf6' },
    { v: d ? num(d.households) : na, l: 'Өрх', tone: '#f59e0b' },
    { v: d ? ha(d.usableM2, 0) : na, u: 'га', l: 'Барилгын талбай', tone: '#22c55e' },
    { v: b ? pct(b.progress, 0) : (bld.state === 'error' ? '—' : '…'), l: 'Дундаж гүйцэтгэл', tone: '#ea580c' },
  ];

  return (
    <>
      {tiles.map((t) => (
        <div key={t.l} className={o.tile} style={{ '--tone': t.tone } as CSSProperties}>
          <span className={`${o.tileVal} num`}>
            {t.v}{t.u && <span className={o.tileUnit}>{t.u}</span>}
          </span>
          <span className={o.tileLabel}>{t.l}</span>
        </div>
      ))}
    </>
  );
}

/* ══════════════════ Карт бүрхүүл ══════════════════ */

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className={o.card}>
      <div className={o.cardHead}>
        <h3 className={o.cardTitle}>{title}</h3>
        {note && <span className={o.cardNote}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

/* ══════════════════ Дугуй диаграм — барилгын төлөв ══════════════════ */

function BuildStatusCard({ ov }: { ov: Async<Overview> }) {
  return (
    <Card title="Барилгын төлөв" note="Barilga_ty">
      <Data q={ov} loading="Тооцож байна…">
        {(d) => {
          // BUILT_STATUS-ийн дараалал ба өнгөөр — газрын зурагтай ижил
          const items = BUILT_STATUS
            .map((st) => ({
              key: st.value,
              label: st.value,
              value: d.buildByStatus.find((x) => x.label === st.value)?.n ?? 0,
              color: st.hue,
            }))
            .filter((i) => i.value > 0);
          return items.length ? (
            <Donut items={items} center={num(d.buildings)} centerLabel="барилга" size={124} width={20} />
          ) : (
            <p className={o.state}>Барилгын төлөв бүртгэгдээгүй.</p>
          );
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Дугуй диаграм — бүсийн ангилал ══════════════════ */

function ZoneTypeCard({ ov }: { ov: Async<Overview> }) {
  return (
    <Card title="Бүсийн ангилал" note="TOROL">
      <Data q={ov} loading="Тооцож байна…">
        {(d) => {
          const items = d.zonesByType.map((g) => ({
            key: g.label,
            label: g.label,
            value: g.n,
            color: ZONE_TYPES[g.label] ?? ZONE_TYPE_EMPTY_HUE,
          }));
          return items.length ? (
            <Donut items={items} center={num(d.zones)} centerLabel="бүс" size={124} width={20} />
          ) : (
            <p className={o.state}>Бүсийн ангилал бүртгэгдээгүй.</p>
          );
        }}
      </Data>
    </Card>
  );
}

/* ══════════════════ Индикатор + график — гүйцэтгэлийн түвшин ══════════════════ */

const BUILD_HUE = LAYER_BY_ID['mon:building'].hue;

function ProgressCard({ bld }: { bld: ReturnType<typeof useBuildings> }) {
  return (
    <Card title="Гүйцэтгэлийн түвшин" note="блокоор">
      <Data q={bld} loading="Тооцож байна…">
        {(d) => (
          <>
            <div className={o.progressRow}>
              <Ring value={d.progress} color={BUILD_HUE} size={76} width={8} />
              <p className={o.progressText}>
                <b>{num(d.blocks)}</b> блокийн дундаж гүйцэтгэл. Нийт <b>{num(d.households)}</b> айл.
                Төлөвлөгдөөгүй ажлыг (−1) хассан.
              </p>
            </div>
            <Bars
              max={Math.max(1, ...d.levels.map((l) => l.value))}
              items={d.levels.map((l) => ({
                key: l.key,
                label: `${l.label} · ${l.range}`,
                value: l.value,
                display: `${num(l.value)} блок`,
                color: l.color,
              }))}
            />
          </>
        )}
      </Data>
    </Card>
  );
}

/* ══════════════════ Багана график — ажлын үе шат ══════════════════ */

function StagesCard({ bld }: { bld: ReturnType<typeof useBuildings> }) {
  return (
    <Card title="Ажлын үе шат" note="төлөвлөгдсөн блокуудын дундаж">
      <Data q={bld} loading="Тооцож байна…">
        {(d) => (
          <Bars
            color={BUILD_HUE}
            max={100}
            limit={8}
            items={d.stages.map((st) => ({
              key: st.key,
              label: st.label,
              value: st.value ?? 0,
              display: st.blocks === 0 || st.value == null ? 'төлөвлөгдөөгүй' : pct(st.value, 0),
            }))}
          />
        )}
      </Data>
    </Card>
  );
}

/* ══════════════════ Цуваа график — багц тус бүрийн гүйцэтгэл ══════════════════ */

function BagtsCard({ bld }: { bld: ReturnType<typeof useBuildings> }) {
  return (
    <Card title="Багц тус бүрийн гүйцэтгэл" note="дундаж %">
      <Data q={bld} loading="Тооцож байна…">
        {(d) =>
          d.bagts.length ? (
            <Series
              color={BUILD_HUE}
              unit="дундаж гүйцэтгэл, %"
              items={d.bagts.map((b) => ({
                key: b.key,
                // Урт «Багц» угтварыг богиносгож тэнхлэгт багтаана
                label: b.key.replace(/^багц\s*/i, 'Б'),
                value: b.progress ?? 0,
                display: b.progress == null ? '—' : pct(b.progress, 0),
              }))}
            />
          ) : (
            <p className={o.state}>Багцын мэдээлэл алга.</p>
          )
        }
      </Data>
    </Card>
  );
}

/* ══════════════════ Индикатор — талбайн хяналт ══════════════════ */

function SurveyCard({ ov }: { ov: Async<Overview> }) {
  return (
    <Card title="Талбайн хяналт" note="Survey123">
      <Data q={ov} loading="Тооцож байна…">
        {(d) =>
          d.survey.count === 0 ? (
            <p className={o.state}>Мобайл аппаас тайлан хараахан ирээгүй.</p>
          ) : (
            <div className={o.surveyRow}>
              <Ring value={d.survey.progress} color={SURVEY_HUE} size={78} width={8} label="б. угсралт" />
              <div className={o.surveyStats}>
                <div><b className="num">{num(d.survey.count)}</b><span>Ирсэн тайлан</span></div>
                <div><b className="num">{num(d.survey.workers)}</b><span>Хүн хүч</span></div>
                <div><b className="num">{num(d.survey.machines)}</b><span>Техник</span></div>
              </div>
            </div>
          )
        }
      </Data>
    </Card>
  );
}
