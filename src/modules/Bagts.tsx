'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSyncRef } from '@/lib/useSyncRef';
import { t as tr } from '@/lib/i18nCore';
import { useMap } from '@/components/MapCanvas';
import { Section, Note, Bars, Rows, Data } from '@/components/ui';
import { uniqueBlocks, type Block } from '@/modules/BuildingPanel';
import { useAsync, type Async } from '@/lib/useAsync';
import { layerTotals, qtyText } from '@/lib/totals';
import {
  BUILDING, LAYER_BY_ID, PKG_BY_BAGTS, bagtsKey, parcelOidsWhere, BLOCK_LAYER,
} from '@/lib/services';
import { mnt, num, pct, tint, NO_DATA } from '@/lib/format';
import type { Overlap } from '@/lib/parcelOverlap';
import { commonName } from '@/lib/butetsPacks';
import { MAP_PKG_ALIAS } from '@/lib/pkgAlias';
import o from './bagtsOv.module.css';

/**
 * БАГЦЫН ХУВААЛЦСАН ХЭСГҮҮД — багцын загвар (`Pack`, `buildPacks`) ба
 * «Багцын гүйцэтгэл» (PkgProg) · «Багцын санхүү» (PkgFin) харагдацын картууд.
 */

const HUE = LAYER_BY_ID['mon:building'].hue;

const INFRA_HUE = '#0891b2';
/** «Тодорхойгүй / задраагүй» бүлэг — жинхэнэ ангилал мэт өнгөтэй байх ёсгүй */
const BLANK_HUE = NO_DATA;
export { BLOCK_LAYER };
/**
 * Багцын БЛОКИЙН тоо — давхардсан feature (ижил `buildingKey`) НЭГ блок (2026-10-01,
 * «хэрэглэгч: бүгдийг зас»). `Pack.blocks` нь feature бүрийг хадгална (жагсаалт, OID);
 * ТОО нь үүгээр — газрын зургийн давхардал тоонд орохгүй.
 */
export const blockCount = (p: Pick<Pack, 'blocks'>): number => uniqueBlocks(p.blocks).length;
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
 */
/* `commonName` нь `lib/butetsPacks.ts`-д — эрхийн панел ч хэрэглэдэг (2026-09-23) */

/**
 * БАГЦУУДЫГ УГСРАХ — Bagts ба Tsogts (цогц хяналт) хоёулаа энэ ГАНЦ логикоор.
 * Цэвэр функц: эх сурвалжийн мөрүүдээс Pack[] бүтээнэ (дэлгэрэнгүй тайлбар нь
 * файлын толгойд).
 */
export function buildPacks(
  rows: Block[] | null,
  /**
   * `bagtsKey` → багцын гүйцэтгэл (0–100) — `loadBuildings.pkgPct`
   * (`blockProgress.pkgProgressOf`). Өгвөл барилгын багцын `progress` ҮҮНЭЭС.
   */
  pkgPct?: ReadonlyMap<string, number>,
): Pack[] {
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
      const key = bagtsKey(name);
      const uniq = uniqueBlocks(blocks);
      build.push({
        key,
        name,
        kind: 'build',
        layerIds: [BLOCK_LAYER],
        where: oidWhere(blocks.map((b) => b.oid)),
        blocks: blocks.slice().sort((a, b) => a.blok.localeCompare(b.blok, 'mn', { numeric: true })),
        households: uniq.reduce((s, b) => s + b.ail, 0),
        progress: pkgPct ? pkgPct.get(key) ?? null : meanOf(uniq.map((b) => b.progress)),
      });
    }
    build.sort((a, b) => a.name.localeCompare(b.name, 'mn', { numeric: true }));
  }

  /**
   * ── Дэд бүтцийн багц ──
   */
  const infra: Pack[] = Object.keys(PKG_BY_BAGTS).map((key) => {
    const layerIds = PKG_BY_BAGTS[key] ?? [];
    const alias = Object.keys(MAP_PKG_ALIAS).find((k) => MAP_PKG_ALIAS[k].key === key);
    const titles = layerIds.map((id) => LAYER_BY_ID[id]?.title ?? id);
    return {
      key,
      name: titles.length ? commonName(titles) : key,
      kind: 'infra' as const,
      layerIds,
      where: null,
      blocks: [],
      households: 0,
      progress: pkgPct?.get(key) ?? (alias ? pkgPct?.get(alias) : undefined) ?? null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'mn', { numeric: true }));

  return [...build, ...infra];
}

/**
 * Гүйцэтгэлийн хувь → НЭГ ӨНГӨНИЙ сүүдэр (улаан→ногоон солонго биш). Өндөр
 * гүйцэтгэл тод, бага нь бүдэг — барилгын hue дээр (хэрэглэгчийн хүсэлт).
 */
export function levelColor(v: number | null): string {
  return v == null ? BLANK_HUE : tint(HUE, v / 100);
}

/* ══════════════════ Толгойн үзүүлэлт ══════════════════ */

/**
 * Сонгосон багцын үзүүлэлт; сонголтгүй үед БҮХ багцын нэгтгэл.
 */
export function PackKpi({
  active,
  packs,
  overlap,
  fin,
  project,
}: {
  active: Pack | null;
  packs: Pack[];
  /**
   * ТӨСЛИЙН НЭГДСЭН орон сууцны гүйцэтгэл — багц СОНГООГҮЙ үеийн «гүйцэтгэл» хавтан.
   */
  project?: { pct: number | null; loading: boolean };
  /**
   * САНХҮҮГИЙН ИНДИКАТОР — өгвөл биет явцын оронд ЗӨВХӨН мөнгөний тоо гарна.
   *
   * `undefined` = гүйцэтгэлийн горим (хуучин зан төлөв), `null` = ачаалж байна.
   */
  fin?: {
    plan: number; given: number;
    contract: number; givenContracted: number;
  } | null;
  /**
   * Багцтай давхцсан үлдсэн нэгж талбар — `null` бол хараахан ачаалж байна,
   * `'error'` бол тоолж ЧАДААГҮЙ (0-ээр орлуулбал «саад алга» гэсэн худал
   * сайн мэдээ болно).
   */
  overlap?: Overlap | 'error' | null;
}) {
  const scope = active ? [active] : packs;
  const blocks = scope.reduce((s, p) => s + blockCount(p), 0);
  const households = scope.reduce((s, p) => s + p.households, 0);
  const progress = active ? active.progress : project?.pct ?? null;
  const progressLoading = !active && !!project?.loading;
  const layers = scope.filter((p) => p.kind === 'infra').reduce((s, p) => s + p.layerIds.length, 0);

  /**
   * ДАВХЦСАН ҮЛДСЭН НЭГЖ ТАЛБАР — зөвхөн багц сонгосон үед. Тоо нь 0 байсан ч
   * ХАРУУЛНА: «саад алга» гэдэг нь өөрөө хариулт бөгөөд хоосон нүд үлдээвэл
   * хэрэглэгч ачаалж байна гэж эндүүрнэ. Ачаалж байх үед «…».
   */
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
    const share = fin && fin.contract > 0 ? (fin.givenContracted / fin.contract) * 100 : null;
    const finItems = [
      { v: fin == null ? '…' : has ? mnt(fin.plan) : '—', l: tr('төлөвлөгөөт санхүүжилт'), c: 'var(--data)' },
      { v: fin == null ? '…' : has ? mnt(fin.given) : '—', l: tr('олгосон санхүүжилт'), c: 'var(--good-ink)' },
      { v: fin == null ? '…' : share == null ? '—' : pct(share, 1), l: tr('олгосон — гэрээний дүнгийн %'), c: 'var(--data)' },
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
      {
        v: progress == null ? (progressLoading ? '…' : '—') : pct(progress, 1),
        l: active ? tr('гүйцэтгэл') : tr('бодит гүйцэтгэлийн хувь'),
        c: levelColor(progress),
      },
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

export function BlocksCard({
  p,
  title = tr('Блок бүрийн гүйцэтгэл'),
  collapsible,
  defaultOpen,
  overlapN,
  overlapOids,
  onOverlapPick,
  sel,
  onSel,
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
   */
  overlapOids?: number[];
  /**
   * Зурвасын сонголтыг ЭЦЭГТ мэдэгдэнэ (сонгосон OID-ууд, эс бөгөөс `null`).
   */
  onOverlapPick?: (oids: number[] | null) => void;
  sel?: string | null;
  onSel?: (v: string | null) => void;
}) {
  const withData = uniqueBlocks(p.blocks).filter((b) => b.progress != null).length;
  const { zoomToWhere, setHighlight } = useMap();
  /** Сонгосон блок — дарахад зурагт тодруулж ойртоно, дахин дарахад болино */
  const [selInner, setSelInner] = useState<string | null>(null);
  const selOid = sel !== undefined ? sel : selInner;
  const onSelRef = useRef(onSel);
  useSyncRef(onSelRef, onSel);
  const setSelOid = useCallback((v: string | null) => {
    setSelInner(v);
    onSelRef.current?.(v);
  }, []);
  const selRef = useRef(selOid);
  useSyncRef(selRef, selOid);
  const releaseRef = useRef(onOverlapPick);
  useSyncRef(releaseRef, onOverlapPick);
  useEffect(() => () => {
    if (selRef.current != null) setHighlight(null);
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
    onOverlapPick?.(null);
    if (off) { setHighlight(null); return; }
    const w = `${BUILDING.oid} = ${Number(key)}`;
    setHighlight(w, BLOCK_LAYER);
    zoomToWhere(BLOCK_LAYER, w);
  };

  /**
   * ДАВХЦСАН ТАЛБАР РУУ ОЧИХ — зурвас дээр дарахад.
   */
  const OV_KEY = 'overlap';
  const ovOn = selOid === OV_KEY;
  const ovHas = !!overlapOids?.length;
  const ovGo = () => {
      if (!overlapOids?.length) return;
      setHighlight(null);
      if (ovOn) { setSelOid(null); onOverlapPick?.(null); return; }
      setSelOid(OV_KEY);
      onOverlapPick?.(overlapOids);
      zoomToWhere(PARCEL_LAYER, parcelOidsWhere(overlapOids), { animate: false });
    };
  /**
   * ТОЛГОЙН БАРУУН ГАРЫН ТЭМДЭГЛЭЛ.
   */
  const note = overlapN === undefined
    ? tr('{0}/{1} бүртгэлтэй', num(withData), num(blockCount(p)))
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
              нүдээр илт зааглана. Тоо >0 бол шар аяс — ажилд саад буй. */}
          {ovHas ? (
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
          key: String(b.oid),
          label: b.blok || '—',
          value: b.progress ?? null,
          color: levelColor(b.progress),
          display: b.progress == null
            ? tr('мэдээлэлгүй')
            : tr('{0}{1}', pct(b.progress, 1), b.floors ? tr(' · {0} давхар', b.floors) : ''),
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
  }, [key]);
}
