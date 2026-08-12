'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { Section, Note, Data, Empty, Donut, Rows, Bars, List, ListItem } from '@/components/ui';
import {
  buildPacks, PackKpi, ContractCard, BlocksCard,
  InvestCard, LayersCard, levelColor, BLOCK_LAYER, type Pack,
} from '@/modules/Bagts';
import { CASH_SOURCES } from '@/lib/cashflow';
import {
  useBuildings, MonitorBagts, MonitorGeneral, MonitorDetail, useTaskPerf,
  pickedBuilding, type PickedBuilding,
} from '@/modules/BuildingPanel';
import {
  loadFinData, contractMonths, ComboChart, lagOf, lagLevel, type FinData,
} from '@/modules/Finance';
import { useCashflow } from '@/lib/cashflow';
import { useInvest } from '@/lib/invest';
import { useAsync, type Async } from '@/lib/useAsync';
import { BUILDING, CASHFLOW2, INVEST, PROGRESS_LEVELS, LAYER_BY_ID, bagtsKey } from '@/lib/services';
import { shade, mntShort, num, pct } from '@/lib/format';
import { readParam, writeParams } from '@/lib/urlState';
import o from './overview.module.css';
import f from './finance.module.css';
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
  const q = useBuildings();
  const cashQ = useCashflow();
  const invQ = useInvest();
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
    () => buildPacks(
      q.state === 'ready' ? q.data.rows : null,
      cashQ.state === 'ready' ? cashQ.data : [],
      invQ.state === 'ready' ? invQ.data : [],
    ),
    [q, cashQ, invQ],
  );

  const active = packs.find((p) => p.key === sel) ?? null;

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
      const k2 = bagtsKey(String(r[C.pkg2] ?? ''));
      const k3 = bagtsKey(String(r[C.pkg] ?? ''));
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
   * ДЭД БҮТЦИЙН багцуудыг ХО-ын «Төрөл»-өөр нь бүлэглэнэ (жиш. «2.ГАДНА
   * ТОХИЖИЛТ», «7.НИЙГМИЙН ДЭД БҮТЭЦ» — тэргүүн тоо нь эрэмбийг өгдөг).
   * Төсөв нь INVEST-д ороогүй (зөвхөн зурагтай) багц «Төсөв бүртгэгдээгүй»
   * бүлэгт орно — алга болгохгүй.
   */
  const infraGroups = useMemo(() => {
    const NO_BUDGET = '~Төсөв бүртгэгдээгүй';
    const map = new Map<string, Pack[]>();
    packs.filter((p) => p.kind === 'infra').forEach((p) => {
      const t = (p.invest[0]?.type ?? '').toString().trim() || NO_BUDGET;
      const arr = map.get(t) ?? [];
      arr.push(p);
      map.set(t, arr);
    });
    // «1.…» дугаараар эрэмбэлнэ; «Төсөв бүртгэгдээгүй» ЗААВАЛ хамгийн сүүлд
    return [...map.entries()].sort(
      (a, b) =>
        (a[0].startsWith('~') ? 1 : 0) - (b[0].startsWith('~') ? 1 : 0) ||
        a[0].localeCompare(b[0], 'mn', { numeric: true }),
    );
  }, [packs]);
  /** Бүлгийн гарчиг — «2.ГАДНА ТОХИЖИЛТ» → «Гадна тохижилт» маягаар цэвэрлэнэ */
  const groupTitle = (t: string) =>
    t.startsWith('~') ? 'Төсөв бүртгэгдээгүй' : t.replace(/^\d+\./, '').trim();

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
      name: 'Бүх багц',
      kind: 'build',
      layerIds: [BLOCK_LAYER],
      where: null,
      blocks,
      households: build.reduce((s, p) => s + p.households, 0),
      progress: meanOf(blocks.map((b) => b.progress)),
      cash: null,
      invest: [],
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

  const visible = active ? active.layerIds : [BLOCK_LAYER];
  const layerWhere = useMemo<Record<string, string | null>>(
    // Багц сонгосон → тэр багц; эс бөгөөс → зөвхөн хоцрогдолтой багцын блокууд
    () => ({ [BLOCK_LAYER]: active?.where ?? alertedWhere }),
    [active, alertedWhere],
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

  useEffect(() => {
    const id = active?.layerIds[0] ?? BLOCK_LAYER;
    // Сонгосон багц → тэр багц руу; эс бөгөөс хоцрогдолтой блокууд руу (байвал)
    zoomToWhere(id, active?.where ?? alertedWhere ?? '1=1');
  }, [active, alertedWhere, zoomToWhere]);

  const loading = q.state === 'loading' || cashQ.state === 'loading' || invQ.state === 'loading';
  const errQ: Async<unknown> | null =
    cashQ.state === 'error' ? cashQ : invQ.state === 'error' ? invQ : null;

  return (
    <div className={ts.pack}>
      {/* ── ДЭЭР: сонгосон багцын KPI ── */}
      <div className={ts.kpi}>
        {errQ ? null : loading ? <Empty label="Ачаалж байна…" /> : (
          <PackKpi active={active} packs={packs} />
        )}
      </div>

      {/* ── ЗҮҮН: багцын жагсаалт ── */}
      <aside className={ts.list}>
        <h2 className={o.colHead}>Багц</h2>
        {errQ ? (
          <Section title="Багцууд"><Data q={errQ}>{() => null}</Data></Section>
        ) : loading ? (
          <Section title="Багцууд"><Empty label="Ачаалж байна…" /></Section>
        ) : (
          <>
            {/* ⚠ ХОЦРОГДОЛТОЙ багцууд — тусдаа бүлэг, ХАМГИЙН ДЭЭР, карт бүхэлдээ анивчина */}
            {alerted.length > 0 && (
              <div className={ts.alertCard}>
                <TsPackList
                  title="⚠ Хоцрогдолтой багц"
                  note="төлөвлөгөөнөөс хоцорсон"
                  packs={alerted}
                  sel={sel}
                  onSel={pick}
                  finMap={finMap}
                />
              </div>
            )}
            <TsPackList
              title="Барилга угсралт"
              note="блокийн гүйцэтгэл"
              packs={packs.filter((p) => p.kind === 'build' && !alertKeys.has(p.key))}
              sel={sel}
              onSel={pick}
              finMap={finMap}
            />
            {/* Дэд бүтцийн багцууд — ХО-ын ТӨРЛӨӨР бүлэглэсэн (alert-гүй нь) */}
            {infraGroups.map(([t, gp]) => (
              <TsPackList
                key={t}
                title={groupTitle(t)}
                note="гүйцэтгэлийн хувь"
                packs={gp.filter((p) => !alertKeys.has(p.key))}
                sel={sel}
                onSel={pick}
                finMap={finMap}
              />
            ))}
            <Note>
              Багц сонгоход баруунд гэрээ/төсөв, эх үүсвэр, блок бүрийн гүйцэтгэл,
              доор санхүүгийн график гарна. Зураг дээрх барилга дарахад баруун
              талд тухайн барилгын хяналт нээгдэнэ.
            </Note>
          </>
        )}
      </aside>

      {/* ── ТӨВ: зураг ── */}
      <div className={ts.map}>
        <MapCanvas dim={dim} visible={visible} zone={null} layerWhere={layerWhere} onPick={onMapPick} />

        <div className={o.mapDims} role="group" aria-label="Газрын зургийн харагдац">
          {(['2d', '3d', 'bim'] as Dim[]).map((d) => (
            <button key={d} type="button" aria-pressed={dim === d}
              className={`${o.dimBtn} ${dim === d ? o.dimOn : ''}`} onClick={() => setDim(d)}>
              {d.toUpperCase()}
            </button>
          ))}
        </div>

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
              ‹ {pb.bagts} · {pb.blok} — багц руу буцах
            </button>
            <MonitorGeneral b={pb} q={perfQ} />
            <MonitorDetail b={pb} q={perfQ} />
          </>
        ) : errQ ? (
          <Data q={errQ}>{() => null}</Data>
        ) : !active ? (
          /* Багц сонгоогүй — ТӨСЛИЙН НЭГДСЭН: гэрээ/төсөв · эх үүсвэр · төлөв · блок гүйцэтгэл */
          <>
            <TotalCard packs={packs} />
            <TotalSourcesDonut packs={packs} />
            {allPack && <LevelsCard blocks={allPack.blocks} />}
            {/* Блок бүрийн гүйцэтгэл — БАГЦААР нь бүлэглэсэн (нэг багц = нэг карт) */}
            {packs.filter((p) => p.kind === 'build').map((p) => (
              <BlocksCard key={p.key} p={p} title={`${p.name} — блокууд`} />
            ))}
          </>
        ) : active.kind === 'build' ? (
          <>
            <ContractCard p={active} />
            <SourcesDonut p={active} />
            <BlocksCard p={active} />
            <MonitorBagts bagts={active.name} />
          </>
        ) : (
          <>
            <InvestCard p={active} />
            <SourcesDonut p={active} />
            <LayersCard p={active} />
          </>
        )}
      </div>

      {/* ── ДООД ГОЛ: санхүүгийн график (сонгоогүй бол ТӨСЛИЙН НЭГДСЭН) ── */}
      <div className={ts.fin}>
        <FinCard p={active} finQ={finQ} />
      </div>
    </div>
  );
}

/** «Тодорхойгүй / задраагүй» — жинхэнэ эх үүсвэр мэт өнгөтэй байх ёсгүй */
const BLANK_HUE = '#94a3b8';

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
    <Section title={title} note={`${num(packs.length)} багц · ${note}`}>
      <List>
        {rows.map(({ p, lag, lvl, execPct }) => {
          return (
            <ListItem
              key={p.key}
              title={p.name}
              sub={p.kind === 'build'
                ? `${num(p.blocks.length)} блок · ${num(p.households)} айл${lag && lvl ? ` · төл. ${lag.planned.toFixed(0)}% / бодит ${lag.actual.toFixed(0)}%` : ''}`
                : `${p.layerIds.length ? `${num(p.layerIds.length)} давхарга` : 'зураггүй'}${execPct != null ? '' : ' · санхүү бүртгэлгүй'}`}
              value={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {execPct == null ? '—' : pct(execPct, 0)}
                  {lvl && (
                    <b
                      title={lag ? `${lag.month}: төлөвлөсөн ${lag.planned.toFixed(1)}% · бодит ${lag.actual.toFixed(1)}% (−${lag.gap.toFixed(1)}%)` : ''}
                      className={lvl === 'red' ? ts.alertBlink : undefined}
                      style={{ color: lvl === 'red' ? '#e11d48' : '#f59e0b', fontSize: lvl === 'red' ? '1.05em' : '0.9em' }}
                    >
                      ⚠
                    </b>
                  )}
                </span>
              }
              color={lvl === 'red' ? '#e11d48' : lvl === 'yellow' ? '#f59e0b' : p.kind === 'build' ? levelColor(p.progress) : '#0891b2'}
              active={p.key === sel}
              onClick={() => onSel(p.key === sel ? null : p.key)}
            />
          );
        })}
      </List>
    </Section>
  );
}

/**
 * САНХҮҮЖИЛТИЙН ЭХ ҮҮСВЭР — DONUT хэлбэрээр (хэрэглэгчийн хүсэлт).
 * Дата бэлтгэл нь Bagts-ийн SourcesCard/InvestSourceCard-тай ИЖИЛ дүрэм:
 * named эх үүсвэрүүд их дүнгээс нь эрэмбэлэгдэж нэг өнгөний сүүдрээр, эх
 * үүсвэргүй үлдэгдэл нь саарал «тодорхойгүй/задраагүй» зүсмэг болно.
 */
function SourcesDonut({ p }: { p: Pack }) {
  let items: { key: string; label: string; value: number; color: string }[] = [];
  let total = 0;

  if (p.kind === 'build') {
    const c = p.cash;
    if (!c) return null;
    const named = CASH_SOURCES
      .map((s, i) => ({ key: s.field, label: s.label, value: c.sources[i] }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    items = named.map((x, i) => ({ ...x, color: shade(HUE, i, named.length) }));
    const sum = items.reduce((a, x) => a + x.value, 0);
    const rest = c.orderTotal - sum;
    if (rest > 0) items.push({ key: 'rest', label: 'Эх үүсвэр тодорхойгүй', value: rest, color: BLANK_HUE });
    total = c.orderTotal;
  } else {
    if (!p.invest.length) return null;
    const named = INVEST.sources
      .map((s, i) => ({
        key: s.field as string,
        label: s.label as string,
        value: p.invest.reduce((a, r) => a + r.sources[i], 0),
      }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
    items = named.map((x, i) => ({ ...x, color: shade('#0891b2', i, named.length) }));
    const invTotal = p.invest.reduce((a, r) => a + r.total, 0);
    const rest = invTotal - items.reduce((a, x) => a + x.value, 0);
    if (rest > 0) items.push({ key: 'rest', label: 'Эх үүсвэр задраагүй', value: rest, color: BLANK_HUE });
    total = invTotal;
  }
  if (!items.length) return null;

  return (
    <Section title="Санхүүжилтийн эх үүсвэр" note={mntShort(total)}>
      <SourceDonutView items={items} total={total} />
    </Section>
  );
}

/**
 * ArcGIS маягийн leader-line donut — зүсмэг бүрээс гадагш зураас татаж нэр + %
 * бичнэ, голд НИЙТ дүн. Санхүүжилтийн бүх эх үүсвэрийн donut энэ хэлбэртэй.
 */
/** Эх үүсвэрийн өнгө — ногоон, cyan цэнхэр (нэрлэгдсэн); тодорхойгүй нь саарал */
const SOURCE_PALETTE = ['#22c55e', '#06b6d4', '#f59e0b', '#a855f7'];

function SourceDonutView({
  items,
  total,
}: {
  items: { key: string; label: string; value: number; color: string }[];
  total: number;
}) {
  let ci = 0;
  const colored = items.map((x) =>
    x.color === BLANK_HUE ? x : { ...x, color: SOURCE_PALETTE[ci++ % SOURCE_PALETTE.length] },
  );
  return (
    <Donut
      items={colored.map((x) => ({
        ...x,
        display: total > 0 ? `${((x.value / total) * 100).toFixed(0)}%` : '—',
      }))}
      size={150}
      width={26}
      center={mntShort(total).replace(' ₮', '')}
      centerLabel="нийт"
      leaders
      edge={0.5}
    />
  );
}

/**
 * ТӨСЛИЙН НЭГДСЭН гэрээ/төсөв — багц сонгоогүй үеийн баруун карт.
 * Барилгын багцуудын BUS_cashflow дүнгүүд + дэд бүтцийн ХО-ын нийлбэр.
 */
function TotalCard({ packs }: { packs: Pack[] }) {
  const build = packs.filter((p) => p.kind === 'build');
  const budget = build.reduce((s, p) => s + (p.cash?.budget ?? 0), 0);
  const orderTotal = build.reduce((s, p) => s + (p.cash?.orderTotal ?? 0), 0);
  const contract = build.reduce((s, p) => s + (p.cash?.contract ?? 0), 0);
  const paid = build.reduce((s, p) => s + (p.cash?.months.reduce((a, m) => a + m, 0) ?? 0), 0);
  const invest = packs.reduce((s, p) => s + p.invest.reduce((a, r) => a + r.total, 0), 0);
  return (
    <Section tone="primary" title="Төсөл нийт — гэрээ ба төсөв" note={`${build.length} барилгын багц`}>
      <Rows
        items={[
          { key: 'Урьдчилсан төсөвт өртөг', value: <span className="num">{mntShort(budget)}</span> },
          { key: 'Захирамжийн нийт дүн', value: <span className="num">{mntShort(orderTotal)}</span> },
          { key: 'Гэрээ байгуулах эрх', value: <span className="num">{mntShort(contract)}</span> },
          { key: 'Олгосон санхүүжилт', value: <span className="num">{mntShort(paid)}</span> },
          { key: 'Дэд бүтцийн хөрөнгө оруулалт', value: <span className="num">{mntShort(invest)}</span> },
        ]}
      />
    </Section>
  );
}

/** ТӨСЛИЙН НЭГДСЭН эх үүсвэрийн donut — бүх барилгын багцын нийлбэрээр */
function TotalSourcesDonut({ packs }: { packs: Pack[] }) {
  const build = packs.filter((p) => p.kind === 'build' && p.cash);
  if (!build.length) return null;
  const named = CASH_SOURCES
    .map((s, i) => ({
      key: s.field,
      label: s.label,
      value: build.reduce((a, p) => a + (p.cash?.sources[i] ?? 0), 0),
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const items = named.map((x, i) => ({ ...x, color: shade(HUE, i, named.length) }));
  const total = build.reduce((s, p) => s + (p.cash?.orderTotal ?? 0), 0);
  const rest = total - items.reduce((a, x) => a + x.value, 0);
  if (rest > 0) items.push({ key: 'rest', label: 'Эх үүсвэр тодорхойгүй', value: rest, color: BLANK_HUE });
  if (!items.length) return null;
  return (
    <Section title="Санхүүжилтийн эх үүсвэр" note={mntShort(total)}>
      <SourceDonutView items={items} total={total} />
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
    <Section title="Блокийн төлөв" note={`${blocks.length} блок${noData ? ` · ${noData} мэдээлэлгүй` : ''}`}>
      <Bars
        color={HUE}
        items={PROGRESS_LEVELS.map((l, i) => ({
          key: l.key,
          label: `${l.label} ${l.range}`,
          value: counts[i],
          color: shade(HUE, PROGRESS_LEVELS.length - 1 - i, PROGRESS_LEVELS.length),
          display: `${counts[i]} блок`,
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
function FinCard({ p, finQ }: { p: Pack | null; finQ: Async<FinData> }) {
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
        d.contracts.find((r) => bagtsKey(String(r[C.pkg2] ?? '')) === p.key) ??
        d.contracts.find((r) => bagtsKey(String(r[C.pkg] ?? '')) === p.key) ??
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

  // ГАРЧИГ — нэр + (хоцрогдол бол) нэрний ХАЖУУД alert badge
  const title = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {p ? p.name : 'Төсөл нийт'} — санхүүжилт · төлөвлөгөө · гүйцэтгэл
      {lag && lvl && (
        <span
          className={`${f.lagBadge} ${lvl === 'red' ? f.lagRed : f.lagYellow}`}
          title={`${lag.month}: төлөвлөсөн ${lag.planned.toFixed(1)}% · бодит ${lag.actual.toFixed(1)}%`}
        >
          {lvl === 'red' ? 'Хоцрогдол' : 'Анхаарах'} −{lag.gap.toFixed(1)}%
        </span>
      )}
    </span>
  );
  // NOTE — гарчгийн БАРУУН талд «олгогдох нийт санхүүжилт» (график дээр биш)
  const note =
    total > 0 ? (
      <span className={ts.totNote}>
        Олгогдох нийт: <b>{num(total)} ₮</b>
      </span>
    ) : undefined;

  return (
    <Section tone="primary" title={title} note={note}>
      {finQ.state === 'loading' ? (
        <Empty label="Санхүүжилтийн дата…" />
      ) : finQ.state === 'error' ? (
        <Data q={finQ}>{() => null}</Data>
      ) : noRow ? (
        <Empty label="Cashflow-д энэ багцын гэрээ бүртгэлгүй." />
      ) : months ? (
        <>
          <div className={ts.finLegend}>
            <span><i style={{ background: '#0891b2' }} />Төлөвлөсөн санхүүжилт</span>
            <span><i style={{ background: '#22c55e' }} />Олгосон · IPC акт</span>
            <span><i style={{ background: '#a855f7' }} />Биет гүйцэтгэл</span>
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
    const physVals: number[] = [];
    d.phys.forEach((byMon) => {
      const v = byMon.get(m.label);
      if (v != null) physVals.push(v);
    });
    return {
      label: m.label,
      amount: planM[i],
      amountCum: cum,
      cumPct: planTotal > 0 ? (cum / planTotal) * 100 : 0,
      given,
      phys: physVals.length ? physVals.reduce((a, b) => a + b, 0) / physVals.length : 0,
    };
  });
}
