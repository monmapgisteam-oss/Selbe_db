'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { Section, Col, Note, Stats, Stat, Bars, Rows, List, ListItem, Ring, Data, Empty } from '@/components/ui';
import { useBuildings, MonitorBagts, type Block } from '@/modules/BuildingPanel';
import { useAsync, type Async } from '@/lib/useAsync';
import { layerTotals, qtyText } from '@/lib/totals';
import {
  BUILDING, PROGRESS_LEVELS, LAYER_BY_ID, PKG_BY_BAGTS, bagtsKey,
} from '@/lib/services';
import { num, pct, shade, tint, NO_DATA } from '@/lib/format';
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
const INFRA_HUE = '#0891b2';
/** «Тодорхойгүй / задраагүй» бүлэг — жинхэнэ ангилал мэт өнгөтэй байх ёсгүй */
const BLANK_HUE = NO_DATA;
// ⚠️ export — «Барилгын цогц хяналт» (Tsogts) мөн энэ давхаргаар ажиллана
export const BLOCK_LAYER = 'mon:building';

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

  const loading = q.state === 'loading';
  /** Барилгын хүсэлт алдаатай бол `Data`-гийн алдааны UI (текст + «Дахин оролдох») */
  const errQ: Async<unknown> | null = q.state === 'error' ? q : null;

  return (
    <div className={o.pack}>
      <div className={o.kpi}>
        {/* ⚠️ Алдаатай үед KPI гаргахгүй — мөнгөн дүн нь худал 0 болно */}
        {!errQ && <PackKpi active={active} packs={packs} />}
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
        <MapCanvas dim={dim} visible={visible} zone={null} layerWhere={layerWhere} onPick={() => {}} />

        <div className={o.mapDims} role="group" aria-label={tr('Газрын зургийн харагдац')}>
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
export function PackKpi({ active, packs }: { active: Pack | null; packs: Pack[] }) {
  const scope = active ? [active] : packs;
  const blocks = scope.reduce((s, p) => s + p.blocks.length, 0);
  const households = scope.reduce((s, p) => s + p.households, 0);
  const progress = meanOf(scope.flatMap((p) => p.blocks.map((b) => b.progress)));
  const layers = scope.filter((p) => p.kind === 'infra').reduce((s, p) => s + p.layerIds.length, 0);

  const items = active?.kind === 'infra'
    ? [
      { v: num(active.layerIds.length), l: tr('газрын зургийн давхарга'), c: INFRA_HUE },
    ]
    : [
      { v: progress == null ? '—' : pct(progress, 1), l: tr('гүйцэтгэл'), c: levelColor(progress) },
      { v: num(blocks), l: tr('блок'), c: HUE },
      { v: num(households), l: tr('айл'), c: HUE },
      { v: num(layers), l: tr('дэд бүтцийн давхарга'), c: '#0891b2' },
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
export function BlocksCard({ p, title = tr('Блок бүрийн гүйцэтгэл') }: { p: Pack; title?: string }) {
  const withData = p.blocks.filter((b) => b.progress != null).length;
  const { zoomToWhere, setHighlight } = useMap();
  /** Сонгосон блок — дарахад зурагт тодруулж ойртоно, дахин дарахад болино */
  const [selOid, setSelOid] = useState<string | null>(null);
  const pick = (key: string) => {
    const off = selOid === key;
    setSelOid(off ? null : key);
    if (off) { setHighlight(null); return; }
    const w = `${BUILDING.oid} = ${Number(key)}`;
    setHighlight(w, BLOCK_LAYER);
    zoomToWhere(BLOCK_LAYER, w);
  };
  return (
    <Section title={title} note={tr('{0}/{1} бүртгэлтэй', num(withData), num(p.blocks.length))}>
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
