'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { Section, Col, Note, Stats, Stat, Bars, Rows, List, ListItem, Ring, Data, Empty } from '@/components/ui';
import { useBuildings, MonitorBagts, type Block } from '@/modules/BuildingPanel';
import { useCashflow, CASH_SOURCES, type CashRow } from '@/lib/cashflow';
import { useInvest, type InvRow } from '@/lib/invest';
import { useAsync, type Async } from '@/lib/useAsync';
import { layerTotals, qtyText } from '@/lib/totals';
import {
  BUILDING, CASHFLOW, INVEST, PROGRESS_LEVELS, LAYER_BY_ID, PKG_BY_BAGTS, bagtsKey,
} from '@/lib/services';
import { num, pct, mnt, mntShort, text, shade, tint } from '@/lib/format';
import { readParam, writeParams } from '@/lib/urlState';
import o from './overview.module.css';

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
 *     `Selbe_ET_20260725`-ын давхаргууд, мөнгө нь `INVEST` хүснэгт.
 * Хоёуланд нь БАЙХГҮЙ зүйлийг зохиохгүй: барилгын багцад INVEST мөр байхгүй
 * (тэдгээрийн `bagts_name` хоосон), дэд бүтцийн багцад блокийн гүйцэтгэл
 * байхгүй. Карт бүр өөрт хамаарахгүй бол зурагдахгүй.
 *
 * ⚠️ Гурван эх сурвалж багцын нэрийг гурван янз бичдэг («Багц 4.1» / «Багц-4.1»
 * / «Багц 4-1»), дэд бүтцийнх нь бүр «БАГЦ - 19.1», «БАГЦ -21» гэж зайтай. БҮХ
 * холбоос `bagtsKey()`-ээр — түүхий нэрээр жиших нь чимээгүй хоосон холбоос.
 */

const HUE = LAYER_BY_ID['mon:building'].hue;
const INFRA_HUE = '#0891b2';
/** «Тодорхойгүй / задраагүй» бүлэг — жинхэнэ ангилал мэт өнгөтэй байх ёсгүй */
const BLANK_HUE = '#94a3b8';
const BLOCK_LAYER = 'mon:building';

/** Блокуудыг FID-ээр нэрлэн шүүх — багцын нэр давхаргад бохир бичигдсэн байж болно */
const oidWhere = (oids: number[]) =>
  oids.length ? `${BUILDING.oid} IN (${oids.join(',')})` : '1=0';

/** Дундаж — бөглөгдөөгүй блокийг ОРУУЛАХГҮЙ (0 гэж тоовол дундаж худал буурна) */
const meanOf = (vals: (number | null)[]) => {
  const xs = vals.filter((v): v is number => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

type Pack = {
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
  cash: CashRow | null;
  invest: InvRow[];
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

export function Bagts({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  const q = useBuildings();
  const cashQ = useCashflow();
  const invQ = useInvest();
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

  const packs = useMemo<Pack[]>(() => {
    const cash = cashQ.state === 'ready' ? cashQ.data : [];
    const inv = invQ.state === 'ready' ? invQ.data : [];

    /* ── Барилга угсралтын багц — эх нь БЛОКИЙН давхарга ── */
    const build: Pack[] = [];
    if (q.state === 'ready') {
      const byName = new Map<string, Block[]>();
      for (const b of q.data.rows) {
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
          cash: cash.find((c) => bagtsKey(c.zone) === bagtsKey(name)) ?? null,
          invest: [],
        });
      }
      build.sort((a, b) => a.name.localeCompare(b.name, 'mn', { numeric: true }));
    }

    /**
     * ── Дэд бүтцийн багц ──
     * ⚠️ Түлхүүрийн олонлог нь ДАВХАРГА ба ХӨРӨНГӨ ОРУУЛАЛТЫН НЭГДЭЛ. Зөвхөн
     * давхаргаас авбал геометргүй мөнгөн багц (жиш. «БАГЦ-8.3») алга болно;
     * зөвхөн INVEST-ээс авбал төсөв хараахан батлагдаагүй 16 багц алга болно.
     */
    const keys = new Set<string>([
      ...Object.keys(PKG_BY_BAGTS),
      ...inv.map((r) => bagtsKey(r.bagts)).filter(Boolean),
    ]);
    const infra: Pack[] = [...keys].map((key) => {
      const layerIds = PKG_BY_BAGTS[key] ?? [];
      const rows = inv.filter((r) => bagtsKey(r.bagts) === key);
      const titles = layerIds.map((id) => LAYER_BY_ID[id].title);
      return {
        key,
        name: titles.length ? commonName(titles) : text(rows[0]?.bagts, key),
        kind: 'infra' as const,
        layerIds,
        where: null,
        blocks: [],
        households: 0,
        progress: null,
        cash: null,
        invest: rows,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'mn', { numeric: true }));

    return [...build, ...infra];
  }, [q, cashQ, invQ]);

  const active = packs.find((p) => p.key === sel) ?? null;

  /** Сонгосон багц л зурагдана; сонголтгүй бол барилгын бүх блок */
  const visible = active ? active.layerIds : [BLOCK_LAYER];
  const layerWhere = useMemo<Record<string, string | null>>(
    () => ({ [BLOCK_LAYER]: active?.where ?? null }),
    [active],
  );

  // Багц сонгоход түүний объект руу ниснэ; цуцлахад бүх блок руу холдоно
  useEffect(() => {
    const id = active?.layerIds[0] ?? BLOCK_LAYER;
    zoomToWhere(id, active?.where ?? '1=1');
  }, [active, zoomToWhere]);

  const loading = q.state === 'loading' || invQ.state === 'loading';

  return (
    <div className={o.pack}>
      <div className={o.kpi}>
        <PackKpi active={active} packs={packs} />
      </div>

      {/* ЗҮҮН — багцын сонголт */}
      <aside className={`${o.side} ${o.left}`}>
        <h2 className={o.colHead}>Багц</h2>
        {loading ? (
          <Section title="Багцууд"><Empty label="Ачаалж байна…" /></Section>
        ) : (
          <>
            <PackList
              title="Барилга угсралт"
              note="блокийн гүйцэтгэл"
              packs={packs.filter((p) => p.kind === 'build')}
              sel={sel}
              onSel={setSel}
            />
            <PackList
              title="Дэд бүтэц ба нийгмийн барилга"
              note="хөрөнгө оруулалт"
              packs={packs.filter((p) => p.kind === 'infra')}
              sel={sel}
              onSel={setSel}
            />
            <Note>
              Багц дарахад зураг тэр багцын объект руу нисч, баруун талд
              дэлгэрэнгүй нь гарна. Дахин дарвал бүх багц буцаж харагдана.
            </Note>
          </>
        )}
      </aside>

      <div className={o.map}>
        <MapCanvas dim={dim} visible={visible} zone={null} layerWhere={layerWhere} onPick={() => {}} />

        <div className={o.mapDims} role="group" aria-label="Газрын зургийн харагдац">
          {(['2d', '3d', 'bim'] as Dim[]).map((d) => (
            <button key={d} type="button" aria-pressed={dim === d}
              className={`${o.dimBtn} ${dim === d ? o.dimOn : ''}`} onClick={() => setDim(d)}>
              {d.toUpperCase()}
            </button>
          ))}
        </div>

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
        <h2 className={o.colHead}>Дэлгэрэнгүй</h2>
        {!active ? (
          <Empty label="Багц сонгоогүй байна." />
        ) : active.kind === 'build' ? (
          <>
            <ContractCard p={active} />
            <SourcesCard p={active} />
            <MonthsCard p={active} />
            <BlocksCard p={active} />
            <MonitorBagts bagts={active.name} />
          </>
        ) : (
          <>
            <InvestCard p={active} />
            <InvestSourceCard p={active} />
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
function levelColor(v: number | null): string {
  return v == null ? BLANK_HUE : tint(HUE, v / 100);
}

/** Хөрөнгө оруулалтын нийт дүн — баталгаажсан + урьдчилсан */
const invTotal = (rows: InvRow[]) => rows.reduce((a, r) => a + r.total, 0);

/* ══════════════════ Багцын жагсаалт ══════════════════ */

function PackList({
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
    <Section title={title} note={`${num(packs.length)} багц · ${note}`}>
      <List>
        {packs.map((p) => (
          <ListItem
            key={p.key}
            title={p.name}
            sub={p.kind === 'build'
              ? `${num(p.blocks.length)} блок · ${num(p.households)} айл`
              : subInfra(p)}
            value={p.kind === 'build'
              ? (p.progress == null ? '—' : pct(p.progress, 0))
              : (p.invest.length ? mntShort(invTotal(p.invest)) : '—')}
            color={p.kind === 'build' ? levelColor(p.progress) : INFRA_HUE}
            active={p.key === sel}
            onClick={() => onSel(p.key === sel ? null : p.key)}
          />
        ))}
      </List>
    </Section>
  );
}

/**
 * ⚠️ Дэд бүтцийн багцын дэд мөр нь юу БАЙГААГ шууд хэлнэ. Хоёр дутуу тохиолдол
 * бодитоор бий: 16 багц зурагтай ч төсөв нь INVEST-д ороогүй, «БАГЦ-8.3» нь
 * төсөвтэй ч геометргүй. Хоосон мөр үлдээвэл хэрэглэгч дарж үзээд л мэднэ.
 */
function subInfra(p: Pack): string {
  const bits: string[] = [];
  if (p.layerIds.length) bits.push(`${num(p.layerIds.length)} давхарга`);
  else bits.push('зураггүй');
  if (!p.invest.length) bits.push('төсөв бүртгэгдээгүй');
  return bits.join(' · ');
}

/* ══════════════════ Толгойн үзүүлэлт ══════════════════ */

/**
 * Сонгосон багцын үзүүлэлт; сонголтгүй үед БҮХ багцын нэгтгэл.
 *
 * ⚠️ Гүйцэтгэлийн нийлбэр гэж байхгүй — блокоор ДУНДАЖЛАНА (бөглөгдөөгүйг
 * оруулахгүй). Багцуудын дунджийг дахин дундажлавал блок цөөтэй багц том
 * багцтай ижил жинтэй болж, төслийн явц гажина.
 */
function PackKpi({ active, packs }: { active: Pack | null; packs: Pack[] }) {
  const scope = active ? [active] : packs;
  const blocks = scope.reduce((s, p) => s + p.blocks.length, 0);
  const households = scope.reduce((s, p) => s + p.households, 0);
  const progress = meanOf(scope.flatMap((p) => p.blocks.map((b) => b.progress)));
  const budget = scope.reduce((s, p) => s + (p.cash?.budget ?? 0), 0);
  const paid = scope.reduce((s, p) => s + (p.cash?.months.reduce((a, m) => a + m, 0) ?? 0), 0);
  const invest = scope.reduce((s, p) => s + invTotal(p.invest), 0);

  /**
   * ⚠️ `budget` (BUS_cashflow) ба `invest` (INVEST) хоёрыг НЭМЭХГҮЙ: эхнийх нь
   * барилга угсралтын багцын гэрээт өртөг, хоёр дахь нь дэд бүтцийн хөрөнгө
   * оруулалт. Хоёр өөр хүснэгт, хоёр өөр хамрах хүрээ — нийлбэр нь ямар ч
   * тайланд байдаггүй тоо болно. Тусад нь хоёр нүд.
   */
  const items = active?.kind === 'infra'
    ? [
      { v: num(active.layerIds.length), l: 'давхарга', c: INFRA_HUE },
      { v: num(active.invest.length), l: 'хөрөнгө оруулалтын мөр', c: INFRA_HUE },
      { v: mntShort(invTotal(active.invest)), l: 'нийт хөрөнгө оруулалт', c: '#3387b8' },
      { v: mntShort(active.invest.reduce((a, r) => a + r.confirmed, 0)), l: 'баталгаажсан', c: '#22c55e' },
      { v: mntShort(active.invest.reduce((a, r) => a + r.planned, 0)), l: 'урьдчилсан', c: '#f59e0b' },
    ]
    : [
      { v: progress == null ? '—' : pct(progress, 1), l: 'гүйцэтгэл', c: levelColor(progress) },
      { v: num(blocks), l: 'блок', c: HUE },
      { v: num(households), l: 'айл', c: HUE },
      { v: mntShort(budget), l: 'төсөвт өртөг', c: '#3387b8' },
      { v: mntShort(paid), l: 'олгосон санхүүжилт', c: '#22c55e' },
      { v: mntShort(invest), l: 'дэд бүтцийн хөрөнгө оруулалт', c: '#0891b2' },
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

/* ══════════════════ Барилгын багц — гэрээ ба төсөв ══════════════════ */

/**
 * ⚠️ Гурван мөнгөн дүн ГУРВАН ӨӨР үе шатыг заана, нийлбэр биш:
 *   төсөвт өртөг (A5) → захирамжийн дүн (B3) → гэрээ байгуулах эрх (C6).
 * Тэдгээрийг нэмбэл нэг ажлыг гурав тоолно. Зөрүүг нь ХАРУУЛАХ нь гол утга —
 * захирамж төсвөөс их бол өртөг өссөн гэсэн үг.
 */
function ContractCard({ p }: { p: Pack }) {
  const c = p.cash;
  if (!c) {
    return (
      <Section title={`${p.name} — гэрээ`}>
        <Note>Энэ багц `BUS_cashflow`-д бүртгэгдээгүй байна — санхүүгийн дүн алга.</Note>
      </Section>
    );
  }
  const paid = c.months.reduce((a, m) => a + m, 0);
  const over = c.orderTotal - c.budget;
  return (
    <Section tone="primary" title={`${p.name} — гэрээ ба төсөв`} note={text(c.zone)}>
      <Col gap="sm">
        <div className={o.packRing}>
          <Ring value={p.progress} size={86} color={levelColor(p.progress)} label="гүйцэтгэл" />
          <Stats cols={2}>
            <Stat value={num(p.blocks.length)} label="Блок" color={HUE} accent />
            <Stat value={num(p.households)} label="Айл" color={HUE} accent />
          </Stats>
        </div>
        <Rows
          items={[
            { key: 'Гүйцэтгэгч', value: c.contractor },
            { key: 'Урьдчилсан төсөвт өртөг', value: <span className="num">{mnt(c.budget)}</span> },
            { key: 'Захирамжийн нийт дүн', value: <span className="num">{mnt(c.orderTotal)}</span> },
            {
              key: 'Захирамж − төсөв',
              value: <span className="num">{`${over >= 0 ? '+' : '−'}${mnt(Math.abs(over))}`}</span>,
            },
            { key: 'Гэрээ байгуулах эрх', value: <span className="num">{mnt(c.contract)}</span> },
            { key: 'Олгосон санхүүжилт', value: <span className="num">{mnt(paid)}</span> },
            {
              key: 'Захирамжийн гүйцэтгэл',
              value: <span className="num">{c.orderTotal ? pct((paid / c.orderTotal) * 100, 1) : '—'}</span>,
            },
          ]}
        />
      </Col>
    </Section>
  );
}

/**
 * ⚠️ Эх үүсвэрийн нийлбэр нь захирамжийн дүнтэй ТААРАХГҮЙ байж болно: захирамж
 * гараагүй хэсэг нь эх үүсвэргүй үлддэг. Зөрүүг нуухгүй, тусад нь мөр болгоно —
 * эс бөгөөс диаграм «бүх мөнгө эх үүсвэртэй» гэсэн худал зураг өгнө.
 */
function SourcesCard({ p }: { p: Pack }) {
  const c = p.cash;
  if (!c) return null;
  // ⚠️ НЭГ ӨНГӨ (тодоос бүдгэр) — эх сурвалж бүр «өөр утга»гүй, зөвхөн харьцаагаа
  //    харуулна. Их дүнтэй нь тод, багадаа бүдэг; «тодорхойгүй» саарал.
  const named0 = CASH_SOURCES
    .map((s, i) => ({ key: s.field, label: s.label, value: c.sources[i] }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const items: { key: string; label: string; value: number; color: string }[] =
    named0.map((x, i) => ({ ...x, color: shade(HUE, i, named0.length) }));
  const named = items.reduce((a, x) => a + x.value, 0);
  const rest = c.orderTotal - named;
  if (rest > 0) items.push({ key: 'rest', label: 'Эх үүсвэр тодорхойгүй', value: rest, color: BLANK_HUE });
  if (!items.length) return null;

  return (
    <Section title="Санхүүжилтийн эх үүсвэр" note={mntShort(c.orderTotal)}>
      <Bars
        color={HUE}
        items={items.map((x) => ({
          key: x.key, label: x.label, value: x.value, color: x.color, display: mntShort(x.value),
        }))}
      />
    </Section>
  );
}

function MonthsCard({ p }: { p: Pack }) {
  const c = p.cash;
  if (!c || !c.months.some((m) => m > 0)) return null;
  // Бусад чарттай ИЖИЛ — хэвтээ бар, нэг өнгө (тодоос бүдгэр). Их олголттой
  // сар тод, багатай нь бүдэг. Босоо `Series` байсныг хэрэглэгчийн хүсэлтээр солив.
  const mx = Math.max(1, ...c.months);
  return (
    <Section title="Сар бүрийн олголт" note="мөнгөн дүн">
      <Bars
        items={CASHFLOW.months.map((m, i) => ({
          key: m.code, label: m.label, value: c.months[i],
          display: mntShort(c.months[i]), color: tint(HUE, c.months[i] / mx),
        }))}
      />
    </Section>
  );
}

/**
 * ⚠️ Бөглөгдөөгүй блокийг ХАСАХГҮЙ, 0 гэж ч зурахгүй: «мэдээлэлгүй» гэж бичнэ.
 * 0%-иар зурвал тайлан ирээгүй блок нь ажил эхлээгүйтэй андуурагдана.
 */
function BlocksCard({ p }: { p: Pack }) {
  const withData = p.blocks.filter((b) => b.progress != null).length;
  return (
    <Section title="Блок бүрийн гүйцэтгэл" note={`${num(withData)}/${num(p.blocks.length)} бүртгэлтэй`}>
      <Bars
        color={HUE}
        max={100}
        inline
        items={p.blocks.map((b) => ({
          // ⚠️ `b.key` (buildingKey) БИШ: Багц 1-д хоёр блок «29/1» болж хураагдан
          //    давхардаж, React мөр орхигдуулж болно. OID нь үргэлж өвөрмөц.
          key: String(b.oid),
          label: b.blok || '—',
          value: b.progress ?? 0,
          color: levelColor(b.progress),
          display: b.progress == null
            ? 'мэдээлэлгүй'
            : `${pct(b.progress, 0)} · ${num(b.ail)} айл${b.floors ? ` · ${b.floors} давхар` : ''}`,
        }))}
      />
    </Section>
  );
}

/* ══════════════════ Дэд бүтцийн багц ══════════════════ */

/**
 * ⚠️ «Баталгаажсан» ба «урьдчилсан» хоёрыг ЗААВАЛ тусад нь: эхнийх нь гэрээ,
 * захирамж, магадлалаар батлагдсан дүн, хоёр дахь нь захирамж гараагүй таамаг.
 * Нийлүүлбэл батлагдаагүй мөнгө батлагдсан мэт харагдана.
 */
function InvestCard({ p }: { p: Pack }) {
  if (!p.invest.length) {
    return (
      <Section tone="primary" title={p.name}>
        <Note>
          Энэ багц «Хөрөнгө оруулалт · өртөг» хүснэгтэд бүртгэгдээгүй байна —
          зурагт нь харагдах ч төсвийн дүн хараахан батлагдаагүй.
        </Note>
      </Section>
    );
  }
  const confirmed = p.invest.reduce((a, r) => a + r.confirmed, 0);
  const planned = p.invest.reduce((a, r) => a + r.planned, 0);
  const contractors = [...new Set(p.invest.map((r) => r.contractor).filter((c) => c && c !== '—'))];

  return (
    <>
      <Section tone="primary" title={`${p.name} — хөрөнгө оруулалт`} note={text(p.invest[0].bagts)}>
        <Col gap="sm">
          <Stats cols={2}>
            <Stat value={mntShort(confirmed)} label="Баталгаажсан" color="#22c55e" accent />
            <Stat value={mntShort(planned)} label="Урьдчилсан" color="#f59e0b" accent />
          </Stats>
          <Rows
            items={[
              { key: 'Нийт', value: <span className="num">{mnt(confirmed + planned)}</span> },
              { key: 'Төрөл', value: text(p.invest[0].type) },
              ...(contractors.length
                ? [{ key: 'Гүйцэтгэгч', value: contractors.join(', ') }]
                : []),
            ]}
          />
        </Col>
      </Section>

      <Section title="Ажил, төслөөр" note={`${num(p.invest.length)} мөр`}>
        <Bars
          color={INFRA_HUE}
          items={p.invest.map((r, i) => ({
            key: `${i}`,
            label: r.project,
            value: r.total,
            display: mntShort(r.total),
          }))}
        />
      </Section>
    </>
  );
}

function InvestSourceCard({ p }: { p: Pack }) {
  if (!p.invest.length) return null;
  // НЭГ ӨНГӨ (тодоос бүдгэр) — их дүнтэй нь тод; «задраагүй» саарал.
  const named0 = INVEST.sources
    .map((s, i) => ({
      key: s.field as string, label: s.label as string,
      value: p.invest.reduce((a, r) => a + r.sources[i], 0),
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const items: { key: string; label: string; color: string; value: number }[] =
    named0.map((x, i) => ({ ...x, color: shade(INFRA_HUE, i, named0.length) }));
  /**
   * ⚠️ Эх үүсвэрээр задраагүй үлдэгдлийг ЗААВАЛ мөр болгоно. Зөвхөн орон сууц
   * ба олон нийтийн барилга нь эх үүсвэрээр бүрэн задарсан; дэд бүтэц, зам,
   * сургуулийнх задраагүй тул ихэнх багцад энэ мөр ГАНЦААРАА үлдэнэ — тэр нь
   * зөв, «эх үүсвэр нь тодорхойгүй» гэдгийг далдлахгүй.
   */
  const rest = invTotal(p.invest) - items.reduce((a, x) => a + x.value, 0);
  if (rest > 0) items.push({ key: 'rest', label: 'Эх үүсвэр задраагүй', color: BLANK_HUE, value: rest });
  if (!items.length) return null;

  return (
    <Section title="Санхүүжилтийн эх үүсвэр" note={mntShort(invTotal(p.invest))}>
      <Bars
        color={INFRA_HUE}
        items={items.map((x) => ({
          key: x.key, label: x.label, value: x.value, color: x.color, display: mntShort(x.value),
        }))}
      />
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
function LayersCard({ p }: { p: Pack }) {
  const q = usePkgTotals(p.layerIds);
  if (!p.layerIds.length) {
    return (
      <Section title="Давхарга">
        <Note>Энэ багцад газрын зургийн давхарга алга — зөвхөн төсвийн мөр бүртгэгдсэн.</Note>
      </Section>
    );
  }
  return (
    <Section title="Давхарга ба хэмжээ" note={`${num(p.layerIds.length)} давхарга`}>
      <Data q={q} loading="Хэмжээ тооцож байна…">
        {(rows) => (
          <Rows
            items={rows.map((r) => ({
              key: r.title,
              value: <span className="num">{[`${num(r.n)} ш`, r.qty].filter(Boolean).join(' · ')}</span>,
            }))}
          />
        )}
      </Data>
    </Section>
  );
}

/** Сонгосон багцын давхарга бүрийн тоо ба хэмжээ — сонголт солигдох бүрд */
function usePkgTotals(ids: string[]): Async<{ title: string; n: number; qty: string | null }[]> {
  const key = ids.join(',');
  return useAsync(async () => {
    if (!ids.length) return [];
    return Promise.all(ids.map(async (id) => {
      const d = LAYER_BY_ID[id];
      const t = await layerTotals(d, '1=1');
      return { title: d.title, n: t.n, qty: qtyText(d, t.q) };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
