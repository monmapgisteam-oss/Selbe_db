'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSyncRef } from '@/lib/useSyncRef';
import { t as tr, perLocale } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools, MapToolBtn } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';

import { Stats, Stat, Donut, Bars, Ring, Empty, Loading, Data, userError } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import {
  queryStats, queryGroup, queryFeatures, groups, groupWhere, count, sum, avg,
  type Aoi, type Row,
} from '@/lib/query';
import {
  GAZAR_BUILDING, GAZAR_PARCEL, PARCEL_LEFT, PARCEL_CLEARED, parcelOidsWhere,
  PKG_FAMILY_BY_BAGTS,
  layerUrl, ZONE_LAYER, ZONE_FIELDS, zoneType, LAYER_BY_ID, zoneWhere,
} from '@/lib/services';
import { loadPkgOverlaps, type PkgOverlap } from '@/lib/pkgSaad';
import { overlapLeftParcels } from '@/lib/parcelOverlap';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
import { PARCEL_OID, PARCEL_FIND_LIMIT, parcelWhere, findParcelsByNo, type ParcelHit } from '@/lib/parcelEdit';
import { statusKey, isClearedStatus, statusRawsWhere, loadParcelAreaRows, parcelGroupRows } from '@/lib/land';
import { GazarEdit } from './GazarEdit';
import { Section } from '@/components/ui';
import { num, text, cat, NO_DATA } from '@/lib/format';
import o from './gazarOv.module.css';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
import { setNavDirty } from '@/lib/navGuard';
import g from './gazar.module.css';

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТ — газрын зураг ТӨВД, 2 талд нь багана:
 *
 *   ┌───────────┬──────────────────┬───────────────┐
 *   │ ЧӨЛӨӨЛӨЛТ  │   ГАЗРЫН ЗУРАГ    │  БАРИЛГА       │
 *   │ үзүүлэлт + │   + Полигон      │  ─────────────│
 *   │ явц (нэг   │                  │  КАДАСТР       │
 *   │ панелд)    │                  │  (нэгтгэсэн)   │
 *   └───────────┴──────────────────┴───────────────┘
 */

/* ══════════════════ СААД — БАГЦААР ══════════════════ */

/** Газар чөлөөлөлтийн нэгж талбарын давхарга — саадыг үүн дээр тэмдэглэнэ */
const PARCEL_LAYER_ID = 'land:left';


/**
 * БАГЦ БҮР ДЭЭР ДАВХЦАЖ БУЙ ҮЛДСЭН НЭГЖ ТАЛБАР — газрын зургийн ДООД зурвас.
 */
/**
 * СААДЫН ЧАРТЫН БҮЛГҮҮД (2026-09-15) — «Багцын гүйцэтгэл»-ийн `PACK_CATS`-тай
 * ИЖИЛ ангилал, ижил дараалал.
 */
const OV_GROUPS: { key: string; label: () => string }[] = [
  { key: 'build', label: () => tr('Барилга угсралт') },
  { key: 'infra', label: () => tr('Инженерийн дэд бүтэц') },
  { key: 'soc', label: () => tr('Нийгмийн барилга') },
  { key: 'site', label: () => tr('Өндөржилт') },
  { key: 'other', label: () => tr('Бусад') },
];

/**
 * Багцын түлхүүр → бүлэг. `PKG_FAMILY_BY_BAGTS` нь дэд бүтцийн гэр бүлийг
 * (net/pow/src/com → инженер, soc → нийгмийн, site → өндөржилт) хэлнэ;
 * барилгын багц тэнд БАЙХГҮЙ тул блокийн нэрээр (`БАГЦ1`…`БАГЦ42`) танина.
 */
const ovGroupOf = (key: string): string => {
  const fam = PKG_FAMILY_BY_BAGTS[key];
  if (fam === 'soc') return 'soc';
  if (fam === 'site') return 'site';
  if (fam) return 'infra';
  if (/^БАГЦ[0-9]{1,2}$/.test(key)) return 'build';
  return 'other';
};

function OverlapBars({
  q,
  selected,
  onPick,
}: {
  q: ReturnType<typeof useAsync<PkgOverlap[]>>;
  selected: string | null;
  onPick: (pk: PkgOverlap | null) => void;
}) {
  /**
   * ХУРААСАН БҮЛГҮҮД (2026-09-15, хэрэглэгчийн заавар: «hide/unhide дотоод
   * сэдвүүдээр»). Түлхүүр нь бүлгийн `key`, утга нь ХААЛТТАЙ эсэх.
   */
  const [shut, setShut] = useState<Record<string, boolean>>({});
  if (q.state === 'loading') {
    return (
      <Section title={tr('Багц бүрийн чөлөөлөгдөөгүй талбар')}>
        <Loading label={tr('Давхцлыг тоолж байна…')} />
      </Section>
    );
  }
  if (q.state !== 'ready') {
    return (
      <Section title={tr('Багц бүрийн чөлөөлөгдөөгүй талбар')}>
        <Empty label={tr('Давхцлыг тоолж чадсангүй.')} onRetry={q.retry} />
      </Section>
    );
  }
  const rows = q.data;
  if (!rows.length) {
    return (
      <Section title={tr('Багц бүрийн чөлөөлөгдөөгүй талбар')}>
        <Empty label={tr('Аль ч багц дээр давхцсан үлдсэн нэгж талбар алга.')} />
      </Section>
    );
  }
  /**
   * БАГЦЫН АНГИЛАЛ — «Багцын гүйцэтгэл» хуудасны бүлэглэлттэй ИЖИЛ
   * (`PKG_FAMILY_BY_BAGTS`: барилга · инженер · нийгмийн · өндөржилт).
   */
  const grouped = OV_GROUPS.map((gr) => {
    const list = rows.filter((r) => ovGroupOf(r.key) === gr.key);
    return {
      key: gr.key,
      label: gr.label(),
      rows: list.slice().sort((a, b) => b.oids.length - a.oids.length),
      total: new Set(list.flatMap((r) => r.oids)).size,
    };
  }).filter((gr) => gr.rows.length > 0);
  return (
    <Section>
      {grouped.map((grp) => {
        const off = !!shut[grp.key];
        return (
        <div key={grp.key} className={g.ovGroup}>
          <button
            type="button"
            className={g.ovGroupHd}
            aria-expanded={!off}
            onClick={() => setShut((m) => ({ ...m, [grp.key]: !off }))}
            title={off ? tr('Дэлгэх') : tr('Хураах')}
          >
            <span className={g.ovGroupCaret} aria-hidden>{off ? '▸' : '▾'}</span>
            <span className={g.ovGroupName}>{grp.label}</span>
            <span className={`${g.ovGroupNum} num`}>{tr('{0} талбар', num(grp.total))}</span>
          </button>
          {!off && (
          <Bars
            color="var(--bad)"
            max={Math.max(1, ...rows.map((r) => r.oids.length))}
            selected={selected}
            onSelect={(k) => {
              const r = rows.find((x) => x.key === k);
              onPick(r && r.key !== selected ? r : null);
            }}
            items={grp.rows.map((r) => ({
              key: r.key,
              label: tr(r.name),
              value: r.oids.length,
              display: r.failed ? tr('татагдсангүй') : tr('{0} талбар', num(r.oids.length)),
              ...(r.failed ? { color: 'var(--warn)' } : {}),
            }))}
          />
          )}
        </div>
        );
      })}
    </Section>
  );
}

/**
 * Нэг бүсийн ангиллын үлдсэн талбарууд.
 * `where` нь БҮСИЙН давхаргын шүүлт (түүхий `Angilal` утгууд) — чарт
 * товшиход зурагт тэр бүсийг өөрийг нь харуулахад хэрэглэгдэнэ.
 */
type ZoneLeft = {
  key: string; label: string; where: string; oids: number[];
  /** Огтлолцол унасан эсвэл ХАГАС (`Overlap.failed`) — тоо БҮРЭН БИШ */
  failed?: boolean;
};

/**
 * ҮЛДСЭН НЭГЖ ТАЛБАР — ХОТ ТӨЛӨВЛӨЛТИЙН БҮСИЙН АНГИЛЛААР (2026-09-15,
 * хэрэглэгчийн заавар: «бүсийн мэдээлэл final-ийн «Олон нийтийн бүс» гэх
 * мэт ангиллаар шүүнэ — тэр бүсэд ямар газар чөлөөлөгдөөгүй байгааг харна»).
 */
function useZoneLeft() {
  return useAsync<ZoneLeft[]>(async () => {
    const rows = await queryFeatures(layerUrl(ZONE_LAYER), {
      outFields: [ZONE_FIELDS.type],
    });
    /* каноник ангилал → түүхий утгууд */
    const by = new Map<string, Set<string>>();
    for (const r of rows) {
      const raw = String(r[ZONE_FIELDS.type] ?? '').trim();
      if (!raw) continue;
      const canon = zoneType(raw);
      if (!by.has(canon)) by.set(canon, new Set());
      by.get(canon)!.add(raw);
    }
    const list = [...by].map(([canon, raws]) => ({
      canon,
      where: `${ZONE_FIELDS.type} IN (${[...raws].map((v) => `N'${sq(v)}'`).join(', ')})`,
    }));
    const res = await Promise.allSettled(list.map((z) => overlapLeftParcels([{
      layerId: ZONE_LAYER.id,
      where: z.where,
    }])));
    return list
      .map((z, i) => {
        const r = res[i];
        return {
          key: z.canon,
          label: z.canon,
          where: z.where,
          oids: r.status === 'fulfilled' ? r.value.oids : [],
          failed: r.status !== 'fulfilled' || (r.value.failed?.length ?? 0) > 0,
        };
      })
      .filter((x) => x.oids.length > 0 || x.failed)
      .sort((a, b) => b.oids.length - a.oids.length);
  }, []);
}

/** Газрын зурагт харагдах давхаргууд — чөлөөлөлт + барилга/кадастр.
 *  (Хил `khil1` нь `ALWAYS_ON_IDS`-ээр автоматаар ил тул энд бичихгүй; `khil2` 2026-09-17-нд хасагдсан.) */
const VISIBLE_IDS = ['gazar:parcel', 'gazar:building', 'land:left'];
/**
 * Кадастрын нэгж ба үнэлгээний барилга нь ТӨСЛИЙН ТАЛБАЙГААС ГАДУУР бүх
 * хотыг хамардаг тул анхнаасаа асаалттай байхад зураг бүхэлдээ будагдаж,
 * гол сэдэв болох ҮЛДСЭН НЭГЖ ТАЛБАР (`land:left`) дотор нь алга болдог
 * байв. Одоо полигон зурж тооцоолмогц л нэмэгдэнэ.
 */
const BASE_IDS = ['land:left'];
/** Полигоноор ШҮҮГДЭХ давхаргууд — featureEffect (бүдгэрүүлэлт) зөвхөн эдгээрт */
const FILTER_IDS = ['land:left', 'gazar:building', 'gazar:parcel'];

/**
 * Төлөв → өнгө ба нэр.
 */
const STATUS_META = [
  { value: PARCEL_CLEARED, get label() { return tr('Бүрэн чөлөөлсөн'); }, color: 'var(--good)' },
] as const;

const STATUS_ORDER: string[] = STATUS_META.map((m) => m.value);
const STATUS_LABEL = perLocale((): Record<string, string> => Object.fromEntries(STATUS_META.map((m) => [m.value, m.label])));
const STATUS_COLOR: Record<string, string> = Object.fromEntries(STATUS_META.map((m) => [m.value, m.color]));

/** Donut-ийн зүсмэгийн палитр — ГАНЦ өгөгдлийн өнгөний (Сэлбэ teal) сүүдэр */
const PALETTE = Array.from({ length: 8 }, (_, i) => cat(i));

/** м² → га */
const ha = (m2: number) => num(m2 / 10_000, 2);

/**
 * ₮ дүн — БҮТНЭЭР, мянгатын таслалтай. `Stat` нь утга/нэгжийг тусад нь
 * байрлуулдаг тул хос буцаана.
 */
const money = (v: number): { v: string; unit: string } => ({ v: num(v), unit: '₮' });

/**
 * Бүлэглэсэн мөрүүд → диаграмын зүсмэгүүд (өнгө автоматаар, тоо НЭГЖТЭЙ).
 */
function toItems(rows: Row[], field: string, valueKey: string, unit = tr('ш'), cap = false) {
  const all = groups(rows, field, tr('Тодорхойгүй'), [valueKey]);
  const head = cap && all.length > PALETTE.length ? all.slice(0, PALETTE.length) : all;
  const tail = all.slice(head.length);
  const items = head.map((grp, i) => ({
    key: grp.label || `#${i}`,
    label: grp.label,
    value: grp.values[valueKey] ?? 0,
    display: grp.stats[valueKey] == null ? '—' : `${num(grp.stats[valueKey])} ${unit}`,
    color: PALETTE[i % PALETTE.length],
    where: groupWhere(field, grp),
  }));
  if (tail.length) {
    const v = tail.reduce((acc, grp) => acc + (grp.values[valueKey] ?? 0), 0);
    items.push({
      key: '__other__',
      label: tr('Бусад'),
      value: v,
      display: `${num(v)} ${unit}`,
      color: NO_DATA,
      where: tail.map((grp) => `(${groupWhere(field, grp)})`).join(' OR '),
    });
  }
  return items;
}

/**
 * Зүсмэгийн түлхүүрээс түүний БЭЛЭН WHERE-ийг олно.
 */
const whereOf = (items: { key: string; where: string }[], k: string): string =>
  items.find((x) => x.key === k)?.where ?? '1=0';

/** Зүсмэгийн түлхүүр → харагдах нэр. 2026-10-09 (аудит №3): «Бусад»-ын түлхүүр `__other__` тул
 *  шүүлтийн шошгонд түлхүүрийг шууд бичихгүй. */
const labelOf = (items: { key: string; label: string }[], k: string): string =>
  items.find((x) => x.key === k)?.label ?? k;

type StatusBars = { key: string; label: string; value: number; color: string; where: string }[];
type ReasonItems = {
  key: string; label: string; n: number; pct: number; area: number; color: string;
  /** Түүхий утгуудаас урьдчилан бүтээсэн WHERE — дарж зурагт шүүхэд */
  where: string;
}[];

/* ── Чарт дарж газрын зурагт шүүх (дашбоардтай ИЖИЛ механизм) ── */

type GFlt = { grp: string; key: string; label: string; where: string; only: string[] };

/** SQL string literal — дан хашилтыг давхарлана */
const sq = (v: string) => v.replace(/'/g, "''");


type GazarData = {
  /** `Tuluv` төлөвөөс: чөлөөлсөн (бүрэн+цэвэрлэсэн) ба үлдсэн */
  left: { n: number; area: number; cleared: number; cleaned: number; remaining: number; resolved: number };
  /** Төлөв бүрийн ТАЛБАЙ (га) — газрын зурагтай ижил өнгөөр */
  statusAreaBy: StatusBars;
  /** Үлдсэн талбарын ШАЛТГААН (явцын_мэдээ) — тоо/хувь/талбайг тус тусад нь */
  reasons: ReasonItems;
  b: { n: number; value: number | null; floors: number; unitPrice: number };
  bType: ReturnType<typeof toItems>;
  bMat: ReturnType<typeof toItems>;
  p: { n: number; area: number };
  pRight: ReturnType<typeof toItems>;
  pUse: ReturnType<typeof toItems>;
};

export function Gazar({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /** Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана. */
  const { hostRef: sideHostRef, ...side } = useSideResize('gazar');
  const { setHighlight, zoomToWhere, refreshLayer } = useMap();

  /**
   * ЗАСВАРЫН ГОРИМ — «Талбар засах» товчоор асна.
   */
  const [editMode, setEditMode] = useState(false);
  const [editOid, setEditOid] = useState<number | null>(null);
  const [saved, setSaved] = useState('');
  /**
   * КАДАСТРЫН ДУГААРААР ХАЙХ (засварын горимд).
   */
  const [findNo, setFindNo] = useState('');
  const [finding, setFinding] = useState(false);
  const [findMsg, setFindMsg] = useState('');
  const [hits, setHits] = useState<ParcelHit[]>([]);

  const { user, status: authStatus } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  const canEdit = useMemo(
    () => authStatus === 'off' || hasCap(user?.username, 'gazar'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, authStatus, capN],
  );

  const [aoi, setAoi] = useState<Aoi | null>(null);
  const [drawToken, setDrawToken] = useState(0);
  /**
   * ПОЛИГОН ЗУРАХ ГОРИМ АСААЛТТАЙ ЭСЭХ (2026-09-15).
   */
  const [drawing, setDrawing] = useState(false);
  const [clearToken, setClearToken] = useState(0);
  /**
   * Кадастрын гурван давхарга нь СУУРЬ; каталогоос порталын аль ч давхаргыг
   * дээр нь нэмнэ (`useLayerPicks`).
   */
  const [visible, setVisible] = useLayerPicks(aoi || drawing ? VISIBLE_IDS : BASE_IDS);
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);

  /**
   * СААД — БАГЦААР (доод зурвас). Сонголт нь ЗУРГИЙГ удирдана: тэр багцын
   * давхарга асаж, парселийн давхарга түүний талбаруудаар нарийсна.
   */
  const ovQ = useAsync(loadPkgOverlaps, []);

  /** Бүсийн ангилал бүрийн үлдсэн талбар — `useZoneLeft`-ийн тайлбарыг үз */
  const zoneQ = useZoneLeft();
  const [ovPick, setOvPick] = useState<PkgOverlap | null>(null);


  /**
   * Сонгосон багцын давхаргууд зурагт НЭМЭГДЭНЭ.
   */
  const mapVisible = useMemo(
    () => {
      if (editMode) return [PARCEL_LAYER_ID];
      return ovPick ? [...new Set([...visible, ...ovPick.layerIds])] : visible;
    },
    [visible, ovPick, editMode],
  );

  /**
   * ДАВХАРГА БҮРИЙН ШҮҮЛТ — зөвхөн багц сонгосон үед.
   */
  const ovWhere = useMemo<Record<string, string | null> | undefined>(() => {
    if (!ovPick) return undefined;
    const w: Record<string, string | null> = {};
    for (const id of ovPick.layerIds) w[id] = ovPick.where;
    /* Газар чөлөөлөлтийн давхаргаас ЗӨВХӨН саад болж буй талбарууд. */
    w[PARCEL_LAYER_ID] = ovPick.oids.length ? parcelOidsWhere(ovPick.oids) : '1=0';
    return w;
  }, [ovPick]);

  /**
   * Сонгосон багцын саадууд УЛААНААР ялгарна.
   */
  const parcelStyle = useMemo(
    () => (ovPick ? { [PARCEL_LAYER_ID]: { hue: '#dc2626', fill: 0.3, width: 2.1 } } : undefined),
    [ovPick],
  );

  /**
   * Чарт-шүүлт — бар/зүсмэг дарахад холбогдох давхаргад тодруулга тавина.
   * Ижил мөрийг дахин дарвал арилна. Полигон (AOI) шүүлттэй ЗЭРЭГ биш —
   * сүүлд хийсэн үйлдэл нь тодруулгыг эзэмшинэ.
   */
  const [flt, setFlt] = useState<GFlt | null>(null);
  /* Сонголт хийхэд зураг тэр талбарууд руу очно */
  const pickOverlap = useCallback((r: PkgOverlap | null) => {
    setOvPick(r);
    if (r?.oids.length) zoomToWhere(PARCEL_LAYER_ID, parcelOidsWhere(r.oids), { animate: false });
  }, [zoomToWhere]);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const aoiGeomRef = useRef<__esri.Geometry | null>(null);
  /** «Цуцлах»-ын дараах `onSketch(null)`-д өмнөх AOI-г хадгалах туг (2026-09-21) */
  const keepAoiRef = useRef(false);

  /** Sketch-ээс ирсэн геометр — бүдгэрүүлэлт ба REST шүүлтийг ЗЭРЭГ тохируулна */
  const onSketch = useCallback((geom: __esri.Geometry | null) => {
    setDrawing(false);
    if (!geom && keepAoiRef.current) {
      keepAoiRef.current = false;
      const prev = aoiGeomRef.current;
      if (prev) { setHighlight(null, FILTER_IDS, prev); return; }
    }
    setFlt(null); // полигон шүүлт тодруулгыг эзэмшинэ — чарт-шүүлтийг цэвэрлэнэ
    aoiGeomRef.current = geom;
    if (!geom) {
      setAoi(null);
      setHighlight(null);
      return;
    }
    const poly = geom as unknown as { rings: number[][][]; spatialReference?: { wkid?: number } };
    const wkid = poly.spatialReference?.wkid ?? 102100;
    setAoi({
      geometry: { rings: poly.rings, spatialReference: { wkid } },
      wkid,
      type: 'polygon',
      rel: 'intersects',
    });
    setHighlight(null, FILTER_IDS, geom);
  }, [setHighlight]);

  /**
   * «ЧӨЛӨӨЛӨЛТ ТООЦООЛОХ» — ДАРААС ДАРАХАД ЦУЦЛАНА (2026-09-15, хэрэглэгчийн
   * заавар: «дараад баруун панел гарч ирнэ, дахиад дархад нөгөө панел гарч
   * ирнэ»).
   */

  /*
   * ПОЛИГОН ЗУРАХ — эхлүүлэх / зогсоох.
   */
  const startDraw = useCallback(() => {
    if (drawing) {
      setDrawing(false);
      /* Зурж эхэлсэн хагас полигоныг зургаас арилгана. */
      keepAoiRef.current = aoiGeomRef.current != null;
      setClearToken((t) => t + 1);
      return;
    }
    setOvPick(null);
    setDrawToken((t) => t + 1);
    setDrawing(true);
  }, [drawing]);

  /*
   *    `GazarEdit` дотор «Хадгалаагүй өөрчлөлт байна. Хаах уу?» баталгаа бий
   *    (`tryClose`), гэвч ЭНЭ файлын `exitEdit`/`onMapPick` нь `editOid`-ыг
   *    `null` болгож компонентыг ШУУД салгадаг тул тэр баталгаа ХЭЗЭЭ Ч
   *    дуудагддаггүй байв. Одоо маягт нь `onDirty`-гээр төлөвөө мэдэгдэж,
   *    энд гурван замд (дахин товших · «Хаах» · өөр парсел) бүгдэд нь асууна.
   */
  const editDirty = useRef(false);
  const markDirty = useCallback((v: boolean) => {
    editDirty.current = v;
    setNavDirty('gazar', v, tr('Газар чөлөөлөлт'));
  }, []);
  useEffect(() => () => setNavDirty('gazar', false), []);
  /**
   * САМБАРЫН ДОТООД БАТАЛГААЖУУЛАЛТ — `window.confirm`-ийн оронд.
   */
  const [confirmQ, setConfirmQ] = useState<{ msg: string; onYes: () => void } | null>(null);
  /**
   * Хадгалаагүй маягт байвал АСУУЖ, зөвшөөрвөл `run`-ыг ажиллуулна; цэвэр бол шууд.
   */
  const askDrop = useCallback((run: () => void) => {
    if (!editDirty.current) { run(); return; }
    setConfirmQ({
      msg: tr('Хадгалаагүй өөрчлөлт байна. Хаях уу?'),
      onYes: () => { markDirty(false); run(); },
    });
  }, [markDirty]);

  /**
   * ГАЗРЫН ЗУРАГ ДЭЭР ТАЛБАР ТОВШИХ.
   */
  const onMapPick = useCallback((a: Record<string, unknown> | null, id: string | null) => {
    if (!editMode) return;
    askDrop(() => {
      if (!a || id !== PARCEL_LAYER_ID) { setEditOid(null); setHighlight(null); return; }
      const oid = Number(a[PARCEL_OID]);
      if (!Number.isFinite(oid)) { setEditOid(null); return; }
      setEditOid(oid);
      setHighlight(parcelWhere(oid), PARCEL_LAYER_ID);
    });
  }, [editMode, setHighlight, askDrop]);

  /**
   * ДУГААРААР ОЛСОН ТАЛБАРЫГ НЭЭНЭ — зураг дээр дарсантай ИЖИЛ үр дүн
   * (тодруулга + маягт), нэмээд зураг тэр талбар руу очно.
   */
  const openParcel = useCallback((oid: number) => {
    askDrop(() => {
      setHits([]);
      setFindMsg('');
      setEditOid(oid);
      setHighlight(parcelWhere(oid), PARCEL_LAYER_ID);
      zoomToWhere(PARCEL_LAYER_ID, parcelWhere(oid), { animate: false });
    });
  }, [askDrop, setHighlight, zoomToWhere]);

  const findSeq = useRef(0);
  const findParcel = useCallback(async () => {
    const no = findNo.trim();
    if (!no) return;
    const seq = ++findSeq.current;
    setFinding(true);
    setFindMsg('');
    setHits([]);
    try {
      const list = await findParcelsByNo(no);
      if (seq !== findSeq.current) return;
      if (!list.length) setFindMsg(tr('«{0}» дугаартай нэгж талбар олдсонгүй', no));
      else if (list.length === 1) openParcel(list[0].oid);
      else {
        const more = list.length > PARCEL_FIND_LIMIT;
        setHits(more ? list.slice(0, PARCEL_FIND_LIMIT) : list);
        setFindMsg(more
          ? tr('Эхний {0} нь — дугаараа нарийсгана уу', num(PARCEL_FIND_LIMIT))
          : tr('{0} нэгж талбар олдлоо — сонгоно уу', num(list.length)));
      }
    } catch (e) {
      if (seq !== findSeq.current) return;
      setFindMsg(userError(e));
    } finally {
      if (seq === findSeq.current) setFinding(false);
    }
  }, [findNo, openParcel]);

  const closeEdit = useCallback(() => {
    markDirty(false);
    setConfirmQ(null);
    setEditOid(null);
    setHighlight(null);
  }, [setHighlight, markDirty]);

  /** Засварын горимоос бүрэн гарах — маягт, тодруулга хоёулаа цэвэрлэгдэнэ */
  const exitEdit = useCallback(() => {
    askDrop(() => {
      findSeq.current++;
      setFinding(false);
      setEditMode(false);
      setEditOid(null);
      setHighlight(null);
      setFindMsg('');
      setHits([]);
    });
  }, [setHighlight, askDrop]);

  /**
   * ЗУРААЛТЫГ Esc-ЭЭР ЦУЦЛАВ (`MapCanvas.onSketchCancel`).
   */
  const onSketchCancel = useCallback(() => setDrawing(false), []);
  const [drawDim, setDrawDim] = useState<typeof dim | null>(null);
  if (drawDim !== dim) {
    setDrawDim(dim);
    if (dim !== '2d') setDrawing(false);
  }

  // Шүүлт солигдоход зураг тэр объектууд руу нисэнэ
  useZoomToFilter({ zone, layerId: flt?.only?.[0] ?? null, where: flt?.where ?? null });
  const fltRef = useRef<GFlt | null>(null);
  useSyncRef(fltRef, flt);

  /**
   * ЗАСВАРЫН ГОРИМД ОРОХ.
   */
  const enterEdit = useCallback(() => {
    setOvPick(null);
    setFlt(null);
    fltRef.current = null;
    keepAoiRef.current = false;
    aoiGeomRef.current = null;
    setAoi(null);
    setDrawing(false);
    setClearToken((t) => t + 1);
    setHighlight(null);
    setEditOid(null);
    setEditMode(true);
  }, [setHighlight]);

  const pickFlt = useCallback((next: GFlt) => {
    const cur = fltRef.current;
    const val = cur && cur.grp === next.grp && cur.key === next.key ? null : next;
    setFlt(val);
    const geom = aoiGeomRef.current ?? undefined;
    setHighlight(
      val ? val.where : null,
      val ? val.only : (geom ? FILTER_IDS : undefined),
      geom,
    );
  }, [setHighlight]);

  /**
   * СОНГОСОН БҮСИЙН АНГИЛАЛ (2026-09-15, хэрэглэгчийн заавар: «давхарга
   * цэснээс бүсийг идэвхжүүлбэл мап дээр харагдана — ингэж чарттайгаа
   * холбомоор байна»).
   *
   * Чартын бар нь нэгж талбаруудыг тодруулаад зогсохгүй, БҮСИЙН давхаргыг
   * өөрийг нь зурагт асааж, тэр ангиллаараа нарийсгана — хэрэглэгч давхаргын
   * цэс рүү орж гараар асаах шаардлагагүй.
   */
  const zonePick = useMemo(
    () => (flt?.grp === 'zoneCat' && zoneQ.state === 'ready'
      ? zoneQ.data.find((z) => z.key === flt.key) ?? null
      : null),
    [flt, zoneQ],
  );

  /**
   * ЗУРГИЙН ЭЦСИЙН ДАВХАРГА / ШҮҮЛТ — багцын давхцал (`ovPick`) дээр бүсийн
   * сонголтыг давхарлана.
   */
  const mapLayers = useMemo(
    () => (zonePick ? [...new Set([...mapVisible, ZONE_LAYER.id])] : mapVisible),
    [mapVisible, zonePick],
  );
  const mapWhere = useMemo<Record<string, string | null> | undefined>(() => {
    const own = zonePick ? { ...(ovWhere ?? {}), [ZONE_LAYER.id]: zonePick.where } : ovWhere;
    if (!own || !zone) return own;
    const out: Record<string, string | null> = {};
    for (const [id, w] of Object.entries(own)) {
      const d = LAYER_BY_ID[id];
      const zw = w && d ? zoneWhere(d, zone) : null;
      out[id] = w && zw ? `(${w}) AND (${zw})` : w;
    }
    return out;
  }, [ovWhere, zonePick, zone]);

  const clear = useCallback(() => {
    keepAoiRef.current = false;
    setClearToken((t) => t + 1);
    setDrawing(false);
    setAoi(null);
    aoiGeomRef.current = null;
    setFlt(null);
    setHighlight(null);
  }, [setHighlight]);

  const aoiKey = aoi ? JSON.stringify(aoi.geometry) : 'all';

  const q = useAsync<GazarData>(async () => {
    const area = aoi ?? undefined;
    const L = PARCEL_LEFT;
    const B = GAZAR_BUILDING;
    const P = GAZAR_PARCEL;
    const sameField = L.fields.status === L.fields.progress;
    const [lRows, bStat, bType, bMat, pStat, pRight, pUse] = await Promise.all([
      loadParcelAreaRows('1=1', area),
      queryStats(B.url, [
        count(B.oid, 'n'), sum(B.fields.value, 'val'),
        avg(B.fields.floors, 'fl'), avg(B.fields.unitPrice, 'up'),
      ], '1=1', area),
      queryGroup(B.url, B.fields.type, [count(B.oid, 'n')], '1=1', area),
      queryGroup(B.url, B.fields.material, [count(B.oid, 'n')], '1=1', area),
      queryStats(P.url, [count(P.oid, 'n'), sum(P.fields.area, 'area')], '1=1', area),
      queryGroup(P.url, P.fields.right, [count(P.oid, 'n')], '1=1', area),
      queryGroup(P.url, P.fields.landuse, [count(P.oid, 'n')], '1=1', area),
    ]);
    /* ТӨЛӨВ (Tuluv) бүрд ТОО ба ТАЛБАЙ — нэгтгэсэн үйлчилгээний гол ангилал */
    const lStatus = parcelGroupRows(lRows);
    /* ҮЛДСЭН талбарын ШАЛТГААН. 2026-09-06: `status` ба `progress` НЭГ талбар — шалтгаан нь төлөв өөрөө. */
    const lReason = parcelGroupRows(lRows.filter((r) => !isClearedStatus(r[L.fields.status])), L.fields.progress);
    const lStat = { n: lRows.length, area: lStatus.reduce((s, r) => s + Number(r.a ?? 0), 0) };
    /* `Талб_1` нөхөлт `parcelAreaOf`-д багтсан — тусдаа нөхөлтийн мөр алга (`sameField` хамаарахгүй) */
    const lAlt: Row[] = [];
    const lAltReason: Row[] | null = sameField ? null : [];
    /** Нөхөлтийн талбайг ТӨЛӨВӨӨР — `smap`-д нэмэхэд */
    const altArea = (r: Row) => Number(r.a ?? 0);
    // ТӨЛӨВ бүрийг ӨГӨГДЛӨӨС нэгтгэнэ (арын зай арилгаж, хоосон/null = «Тодорхойгүй»).
    // Хатуу 3 биш тул нэг ч талбар графикаас гээгдэхгүй — баганууд «Нийт»-тэй тэнцэнэ.
    const smap = new Map<string, { n: number; a: number; raws: Set<string> }>();
    const addStatus = (r: Row, n: number, a: number) => {
      const raw = String(r[L.fields.status] ?? ''); // түүхий утга — WHERE-д яг таарна
      const k = statusKey(r[L.fields.status]) || 'Тодорхойгүй'; // түүхий түлхүүр — дэлгэцэд tr()
      const cur = smap.get(k) ?? { n: 0, a: 0, raws: new Set<string>() };
      cur.n += n;
      cur.a += a;
      if (raw !== '') cur.raws.add(raw);
      smap.set(k, cur);
    };
    for (const r of lStatus) addStatus(r, Number(r.n ?? 0), Number(r.a ?? 0));
    /* Нөхөлт: мөрийн тоо эхний асуулгаас (давхар тоолохгүй), зөвхөн талбай нэмэгдэнэ */
    for (const r of lAlt) if (altArea(r)) addStatus(r, 0, altArea(r));
    const altTotal = lAlt.reduce((s, r) => s + altArea(r), 0);
    const st = (value: string) => smap.get(value) ?? { n: 0, a: 0, raws: new Set<string>() };
    const cleared = st(PARCEL_CLEARED);
    const cleaned = { n: 0, a: 0, raws: new Set<string>() };
    const remaining = [...smap.entries()].reduce(
      (acc, [k, v]) => (k === PARCEL_CLEARED ? acc : { n: acc.n + v.n, a: acc.a + v.a }),
      { n: 0, a: 0 },
    );
    // Мэдэгдэж буй 3 төлөв ЭХЭНД (тогтмол өнгө/дараалал), бусад нь тоогоор нь араас.
    const statusAreaBy: StatusBars = [...smap.entries()]
      .sort((x, y) => {
        const ox = STATUS_ORDER.indexOf(x[0]);
        const oy = STATUS_ORDER.indexOf(y[0]);
        if (ox !== -1 || oy !== -1) return (ox === -1 ? 99 : ox) - (oy === -1 ? 99 : oy);
        return y[1].n - x[1].n;
      })
      .map(([value, s]) => {
        const ha2 = Math.round(s.a / 100) / 100;
        const where = statusRawsWhere(L.fields.status, s.raws, value === 'Тодорхойгүй', value);
        // Тоо ба нэгж (га) ХАМТ — «1,703 талбар · 78.08 га»
        return {
          key: value,
          label: STATUS_LABEL()[value] ?? tr(value),
          value: ha2,
          display: tr('{0} талбар · {1} га', num(s.n), num(ha2, 2)),
          color: STATUS_COLOR[value] ?? (value === 'Тодорхойгүй' ? NO_DATA : 'var(--bad)'),
          where,
        };
      });
    // Шалтгааны нэрийг цэвэрлэж (арын зай, төгсгөлийн «.») нэгтгэнэ.
    const rmap = new Map<string, { n: number; a: number; raws: Set<string> }>();
    const addReason = (r: Row, n: number, a: number) => {
      if (sameField && isClearedStatus(r[L.fields.progress])) return;
      const raw = String(r[L.fields.progress] ?? '');
      let k = text(r[L.fields.progress]).trim().replace(/\.$/, '').trim();
      if (!k || k === '—') k = 'Тодорхойгүй'; // түүхий түлхүүр — дэлгэцэд tr()
      const cur = rmap.get(k) ?? { n: 0, a: 0, raws: new Set<string>() };
      cur.n += n;
      cur.a += a;
      cur.raws.add(raw);
      rmap.set(k, cur);
    };
    for (const r of lReason) addReason(r, Number(r.n ?? 0), Number(r.a ?? 0));
    /* Нөхөлтийн талбай — шалтгаан нь төлөвтэй НЭГ талбар бол `lAlt`-аас (чөлөөлсөнийг
       `addReason` хасна), эс бөгөөс тусдаа асуулгаас. */
    for (const r of lAltReason ?? lAlt) if (altArea(r)) addReason(r, 0, altArea(r));
    const remN = remaining.n || 1;
    const reasons: ReasonItems = [...rmap.entries()]
      .sort((x, y) => y[1].n - x[1].n)
      .map(([label, v]) => {
        const where = statusRawsWhere(L.fields.progress, v.raws, label === 'Тодорхойгүй', label);
        return {
          key: label,
          label,
          n: v.n,
          pct: Math.round((v.n / remN) * 100),
          area: Math.round(v.a / 100) / 100,
          color: label === 'Тодорхойгүй' ? NO_DATA : 'var(--data)',
          where,
        };
      });
    return {
      left: {
        n: Number(lStat.n ?? 0),
        area: Number(lStat.area ?? 0) + altTotal,
        cleared: cleared.n,
        cleaned: cleaned.n,
        remaining: remaining.n,
        resolved: cleared.n + cleaned.n,
      },
      statusAreaBy,
      reasons,
      b: {
        n: Number(bStat.n ?? 0),
        value: bStat.val == null ? null : Number(bStat.val), floors: Number(bStat.fl ?? 0),
        unitPrice: Number(bStat.up ?? 0),
      },
      bType: toItems(bType, B.fields.type, 'n', tr('барилга'), true),
      bMat: toItems(bMat, B.fields.material, 'n', tr('барилга')),
      p: { n: Number(pStat.n ?? 0), area: Number(pStat.area ?? 0) },
      pRight: toItems(pRight, P.fields.right, 'n', tr('нэгж'), true),
      pUse: toItems(pUse, P.fields.landuse, 'n', tr('нэгж')),
    };
  }, [aoiKey]);

  const d = q.state === 'ready' ? q.data : null;
  const err = q.state === 'error';
  const pct = d && d.left.n ? (d.left.resolved / d.left.n) * 100 : null;

  const pickReason = (k: string) => {
    const r = d?.reasons.find((x) => x.key === k);
    if (r) pickFlt({ grp: 'reason', key: k, label: tr('Шалтгаан: {0}', tr(r.label)), where: r.where, only: ['land:left'] });
  };

  /** Панелийн агуулгыг ачаалал/алдаа/хоосонтой хамт зурна */
  const guard = (ready: boolean, body: React.ReactNode) =>
    d ? (ready ? body : <Empty label={tr('Мэдээлэл алга')} />)
      : err ? <Data q={q}>{() => null}</Data> : <Loading label={tr('Татаж байна…')} />;

  return (
    /* Талын багануудыг чирж өргөсгөх/нарийсгах бариулууд. */
    <div
      ref={sideHostRef}
      className={`${g.frame} ${editMode ? g.frameEdit : ''} ${side.hostClass}`}
      style={side.style}
    >
      <SplitGrip {...side.left} />
      <SplitGrip {...side.right} />
      {/* ── ЗҮҮН: Чөлөөлөлт (үлдсэн нэгж талбар) — үзүүлэлт + явц бүгд энд ── */}
      {!editMode && (
      <div className={g.left}>
        {/* Баганын толгой — envhub eyebrow: өнгөгүй; багана нь БАЙРЛАЛААРАА ялгарна */}
        <h3 className={g.colHd}>
          {tr('Төслийн талбайн чөлөөлөх нэгж талбар')}
        </h3>
        <section className={`${g.panel} ${g.panelPrimary}`} aria-label={tr('Төслийн талбайн чөлөөлөх нэгж талбар')}>
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>{tr('Газар чөлөөлөлт')}</h3>
            <span className={g.panelNote}>{d ? tr('{0} үлдсэн', num(d.left.remaining)) : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.left.n > 0, d && (
              <>
                <Stats cols={2}>
                  <Stat value={num(d.left.n)} unit={tr('талбар')} label={tr('Нийт нэгж талбар')} />
                  <Stat value={ha(d.left.area)} unit={tr('га')} label={tr('Нийт талбай')} />
                  <Stat value={num(d.left.cleared)} unit={tr('талбар')} label={tr('Бүрэн чөлөөлсөн')} />
                  <Stat value={num(d.left.remaining)} unit={tr('талбар')} label={tr('Үлдсэн')} />
                </Stats>
                <div className={g.ringBox}>
                  {/* «Чөлөөлсөн» — жинхэнэ САЙН төлөв тул var(--good) (нүүрний ижил цагирагтай нэг өнгө) */}
                  <Ring value={pct} size="lg" color="var(--good)" label={tr('чөлөөлсөн')} />
                  <p className={g.ringNote}>
                    <b className="num">{d ? num(d.left.resolved) : ''}</b> /{' '}
                    <span className="num">{d ? num(d.left.n) : ''}</span> {tr('талбар')}
                    <span className={g.ringSub}>{tr('бүрэн чөлөөлсөн')}</span>
                  </p>
                </div>
                {/*
                  * ХОТ ТӨЛӨВЛӨЛТИЙН БҮСИЙН АНГИЛЛААР — `useZoneLeft`-ийн
                  * тайлбарыг үз (2026-09-15, хэрэглэгчийн заавар).
                  */}
                {zoneQ.state === 'error' && (
                  <>
                    <p className={g.subHead}>
                      {tr('Үлдсэн талбар бүсийн ангиллаар')}
                    </p>
                    <Empty label={tr('Бүсийн давхцлыг тоолж чадсангүй.')} onRetry={zoneQ.retry} />
                  </>
                )}
                {zoneQ.state === 'ready' && zoneQ.data.length > 0 && (
                  <>
                    <p className={g.subHead}>
                      {tr('Үлдсэн талбар бүсийн ангиллаар')}
                    </p>
                    <Bars
                      items={zoneQ.data.map((z) => ({
                        key: z.key,
                        label: tr(z.label),
                        value: z.oids.length,
                        display: z.failed ? tr('татагдсангүй') : tr('{0} талбар', num(z.oids.length)),
                        color: z.failed ? 'var(--warn)' : 'var(--data)',
                      }))}
                      selected={flt?.grp === 'zoneCat' ? flt.key : null}
                      onSelect={(k) => {
                        const z = zoneQ.data.find((x) => x.key === k);
                        if (!z || z.failed) return;
                        pickFlt({
                          grp: 'zoneCat', key: k, label: tr('Бүс: {0}', tr(z.label)),
                          where: parcelOidsWhere(z.oids),
                          only: ['land:left'],
                        });
                      }}
                    />
                  </>
                )}
                <p className={g.subHead}>{tr('Талбай (га) төлөвөөр')}</p>
                {/* limit БАЙХГҮЙ — бүх төлөв харагдаж, баганы нийлбэр «Нийт»-тэй тэнцэнэ */}
                <Bars
                  items={d.statusAreaBy}
                  selected={flt?.grp === 'status' ? flt.key : null}
                  onSelect={(k) => {
                    // Шалтгааны шүүлттэй ижил — item-ийн урьдчилан угсарсан (түүхий утгат) WHERE-ийг авна
                    const it = d.statusAreaBy.find((x) => x.key === k);
                    if (it) pickFlt({ grp: 'status', key: k, label: tr('Төлөв: {0}', it.label), where: it.where, only: ['land:left'] });
                  }}
                />
                {d.reasons.length > 0 && (() => {
                  const selReason = flt?.grp === 'reason' ? flt.key : null;
                  return (
                  <>
                    {/* ГУРВАН график ХЭВЭЭР (тоо / хувь / талбай) — мөр бүрийн
                        тэмдэглэгээнд нэгж ба тоо ХАМТ (хэрэглэгчийн хүсэлт). */}
                    <p className={g.subHead}>
                      {tr('Үлдсэн')} {num(d.left.remaining)} {tr('талбарын шалтгаан')}
                      <span className={g.subNote}> {tr('· тоогоор')}</span>
                    </p>
                    <Bars
                      limit={8}
                      selected={selReason}
                      onSelect={pickReason}
                      items={d.reasons.map((r) => ({
                        key: r.key, label: tr(r.label), value: r.n,
                        display: tr('{0} талбар · {1}%', num(r.n), r.pct), color: r.color,
                      }))}
                    />
                    <p className={g.subHead}>{tr('Шалтгаан')}<span className={g.subNote}> {tr('· хувиар')}</span></p>
                    <Bars
                      limit={8}
                      max={100}
                      selected={selReason}
                      onSelect={pickReason}
                      items={d.reasons.map((r) => ({
                        key: r.key, label: tr(r.label), value: r.pct,
                        display: tr('{0}% · {1} талбар', r.pct, num(r.n)), color: r.color,
                      }))}
                    />
                    <p className={g.subHead}>{tr('Шалтгаан')}<span className={g.subNote}> {tr('· талбайгаар (га)')}</span></p>
                    <Bars
                      limit={8}
                      selected={selReason}
                      onSelect={pickReason}
                      items={[...d.reasons]
                        .sort((a, b) => b.area - a.area)
                        .map((r) => ({
                          key: r.key, label: tr(r.label), value: r.area,
                          display: tr('{0} га · {1} талбар', num(r.area, 2), num(r.n)), color: r.color,
                        }))}
                    />
                  </>
                  );
                })()}
              </>
            ))}
          </div>
        </section>
      </div>
      )}

      {/* ── ТӨВ: Газрын зураг + Полигон ── */}
      <main className={g.map} data-map-host="">
        <MapCanvas
          dim={dim}
          visible={mapLayers}
          opacity={opacity}
          zone={zone}
          layerWhere={mapWhere}
          layerStyle={parcelStyle}
          uniform
          sketch
          onSketch={onSketch}
          onSketchCancel={onSketchCancel}
          drawToken={drawToken}
          clearToken={clearToken}
          onPick={editMode ? onMapPick : undefined}
        />

        {editMode && editOid != null && (
          <GazarEdit
            key={editOid}
            oid={editOid}
            canEdit={canEdit}
            onDirty={markDirty}
            onCancel={closeEdit}
            onDone={(n) => {
              closeEdit();
              if (n > 0) refreshLayer(PARCEL_LAYER_ID);
              setSaved(n > 0
                ? tr('{0} нэгж талбар хадгалагдлаа', num(n))
                : tr('Өөрчлөлт байсангүй'));
              window.setTimeout(() => setSaved(''), 4000);
            }}
          />
        )}

        <MapTools
          dim={dim}
          setDim={setDim}
          layersOpen={catOpen}
          onLayers={() => setCatOpen((v) => !v)}
          opacityOpen={opOpen}
          onOpacity={() => setOpOpen((v) => !v)}
          zone={zone}
          setZone={setZone}
        >
          <MapToolBtn
            icon="polygon"
            onClick={startDraw}
            disabled={dim !== '2d' || editMode}
            title={dim !== '2d'
              ? tr('Полигоныг зөвхөн 2D дээр зурна')
              : editMode
                ? tr('Засварын горимоос гарсны дараа полигон зурна')
                : tr('Газар дээр полигон зурах')}
          >
            {drawing ? tr('Болих') : aoi ? tr('Дахин тооцоолох') : tr('Чөлөөлөлт тооцоолох')}
          </MapToolBtn>
          {aoi && <MapToolBtn onClick={clear}>{tr('Цэвэрлэх')}</MapToolBtn>}
          {canEdit && (
            <MapToolBtn
              icon="pen"
              on={editMode}
              disabled={dim !== '2d' || drawing}
              onClick={() => (editMode ? exitEdit() : enterEdit())}
              title={dim !== '2d'
                ? tr('Засварыг зөвхөн 2D дээр хийнэ')
                : tr('Зөвхөн газрын зураг үлдэж, талбар дарахад төлөв солих цонх нээгдэнэ')}
            >
              {tr('Талбар засах')}
            </MapToolBtn>
          )}
        </MapTools>

        {/* ЗАСВАРЫН АЖЛЫН ЗУРВАС — «энэ бол тусдаа цонх» гэдгийг хэлнэ.
            Хажуугийн баганууд unmount болсон тул зөвхөн зураг үлдэж,
            энэ зурвас нь гарчиг ба гарах замыг өгнө. */}
        {editMode && (
          <div className={g.editBar}>
            <span className={g.editTitle}>{tr('Нэгж талбар засах')}</span>
            <span className={g.editHint}>
              {tr('Газрын зураг дээр нэгж талбар дарна уу')}
            </span>
            <form
              className={g.editFind}
              role="search"
              onSubmit={(e) => { e.preventDefault(); void findParcel(); }}
            >
              <input
                className={g.editFindInput}
                value={findNo}
                onChange={(e) => { setFindNo(e.target.value); setFindMsg(''); }}
                placeholder={tr('Кадастрын дугаар')}
                aria-label={tr('Кадастрын дугаараар хайх')}
                maxLength={40}
                disabled={finding}
              />
              <button type="submit" className={g.editClose} disabled={finding || !findNo.trim()}>
                {finding ? tr('Хайж байна…') : tr('Хайх')}
              </button>
            </form>
            <button type="button" className={g.editClose} onClick={exitEdit}>
              {tr('Хаах')}
            </button>
          </div>
        )}
        {editMode && (findMsg || hits.length > 0) && (
          <div className={g.findPop} role="status">
            {findMsg && <span className={g.findMsg}>{findMsg}</span>}
            {hits.map((h) => (
              <button key={h.oid} type="button" className={g.findHit} onClick={() => openParcel(h.oid)}>
                <b>{h.parcelNo.trim() || `#${h.oid}`}</b>
                <span>{[h.owner, h.status].filter((x) => x.trim()).join(' · ') || '—'}</span>
              </button>
            ))}
          </div>
        )}
        {/* САМБАРЫН БАТАЛГААЖУУЛАЛТ — `confirmQ`-ийн тайлбар (2026-10-09, аудит №6).
            Мэдэгдлийн дээр; «Тийм» үргэлжлүүлж, «Үгүй» юу ч хийхгүй. */}
        {confirmQ && (
          <div className={g.confirm} role="group" aria-live="assertive" aria-label={confirmQ.msg}>
            <span className={g.confirmMsg}>{confirmQ.msg}</span>
            <button
              type="button"
              className={g.primary}
              onClick={() => { const q = confirmQ; setConfirmQ(null); q.onYes(); }}
            >
              {tr('Тийм')}
            </button>
            <button type="button" className={g.btn} onClick={() => setConfirmQ(null)}>
              {tr('Үгүй')}
            </button>
          </div>
        )}
        {saved && <p className={g.saved} role="status">{saved}</p>}


        {catOpen && (
          <div className={g.catPanelRight}>
            <LayerCatalog
              view="gazar"
              visible={visible}
              setVisible={setVisible}
              selected={layerSel}
              onSelect={setLayerSel}
              onClose={() => setCatOpen(false)}
              zone={zone}
              embedded
            />
          </div>
        )}

        {opOpen && (
          <OpacityPanel
            visible={visible}
            opacity={opacity}
            setOpacity={setOpacity}
            onClose={() => setOpOpen(false)}
          />
        )}

        {!editMode && (
        <div className={`${g.scope} ${aoi ? g.scopeSel : ''}`}>
          <span className={g.scopeDot} aria-hidden />
          <span className={g.scopeText}>{aoi ? tr('Сонгосон талбай') : tr('Бүх талбай')}</span>
          <span className={g.scopeHint}>{aoi ? tr('полигоноор шүүсэн') : tr('полигон зурж шүүнэ')}</span>
        </div>
        )}

        {/* Чарт-шүүлтийн чип — дашбоардтай ижил, ×-ээр цуцлана */}
        {flt && (
          <div className={o.chipBar}>
            <div className={o.filterChip}>
              <span className={o.filterLabel}>{flt.label}</span>
              <button type="button" className={o.filterClear} onClick={() => pickFlt(flt)} aria-label={tr('Шүүлт арилгах')} title={tr('Шүүлт арилгах')}>×</button>
            </div>
          </div>
        )}
      </main>


      {/*
        * ── БАРУУН БАГАНА — ДИНАМИК (2026-09-15, хэрэглэгчийн заавар) ──
        *
        * «Газар чөлөөлөлт тооцоолох» дараагүй үед энэ багана нь
        * «Саад — багцаар» чартыг харуулна; полигон зурмагц тооцооллын
        * үр дүн (Барилга · Кадастр) руу СОЛИГДОНО.
        */}
      {!editMode && (
      <div className={g.right}>
        <h3 className={g.colHd}>
          {aoi || drawing
            ? tr('Тооцоолсон талбай — нэгж талбар, барилга')
            : tr('Багц бүрийн чөлөөлөгдөөгүй талбар')}
        </h3>
        {!aoi && !drawing && (
          <OverlapBars q={ovQ} selected={ovPick?.key ?? null} onPick={pickOverlap} />
        )}
        {(aoi || drawing) && (<>
        <section className={`${g.panel} ${g.panelOuter}`} aria-label={tr('Барилга')}>
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>{tr('Барилга')}</h3>
            <span className={g.panelNote}>{d ? tr('{0} барилга', num(d.b.n)) : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.b.n > 0, d && (
              <>
                {/* «Талбай» stat 2026-08-13-нд хасагдав — area_m2 талбар test_data-д алга */}
                <Stats cols={2}>
                  <Stat value={num(d.b.n)} unit={tr('барилга')} label={tr('Тоо')} />
                  <Stat value={d.b.value == null ? '—' : money(d.b.value).v}
                    unit={d.b.value == null ? undefined : money(d.b.value).unit} label={tr('Нийт үнэлгээ')} />
                  <Stat value={d.b.floors ? num(d.b.floors, 1) : '—'} unit={tr('давхар')} label={tr('Дундаж өндөр')} />
                  <Stat value={d.b.unitPrice ? money(d.b.unitPrice).v : '—'} unit={d.b.unitPrice ? tr('{0}/м²', money(d.b.unitPrice).unit) : ''} label={tr('Дундаж м² үнэ')} />
                </Stats>
                {d.bType.length > 0 && (
                  <Donut
                    items={d.bType} size="md" center={num(d.b.n)} centerLabel={tr('барилга')} stack
                    selected={flt?.grp === 'bType' ? flt.key : null}
                    onSelect={(k) => pickFlt({
                      grp: 'bType', key: k, label: tr('Барилга: {0}', labelOf(d.bType, k)),
                      where: whereOf(d.bType, k), only: ['gazar:building'],
                    })}
                  />
                )}
                {d.bMat.length > 0 && (
                  <>
                    <p className={g.subHead}>{tr('Материалаар')}</p>
                    {/* envhub: Bars нь ГАНЦ өгөгдлийн өнгөөр — ялгааг дараалал, хэмжээ өгнө */}
                    <Bars
                      items={d.bMat.map((x) => ({ ...x, color: 'var(--data)' }))} inline limit={5}
                      selected={flt?.grp === 'bMat' ? flt.key : null}
                      onSelect={(k) => pickFlt({
                        grp: 'bMat', key: k, label: tr('Материал: {0}', k),
                        where: whereOf(d.bMat, k), only: ['gazar:building'],
                      })}
                    />
                  </>
                )}
              </>
            ))}
          </div>
        </section>

        <section className={`${g.panel} ${g.panelOuter}`} aria-label={tr('Кадастрын нэгж')}>
          <header className={g.panelHd}>
            <h3 className={g.panelTitle}>{tr('Кадастрын нэгж')}</h3>
            <span className={g.panelNote}>{d ? tr('{0} нэгж', num(d.p.n)) : '…'}</span>
          </header>
          <div className={g.panelBody}>
            {guard(!!d && d.p.n > 0, d && (
              <>
                <Stats cols={2}>
                  <Stat value={num(d.p.n)} unit={tr('нэгж')} label={tr('Нэгжийн тоо')} />
                  <Stat value={ha(d.p.area)} unit={tr('га')} label={tr('Талбай')} />
                </Stats>
                {d.pRight.length > 0 && (
                  <Donut
                    items={d.pRight} size="md" center={num(d.p.n)} centerLabel={tr('нэгж')} stack
                    selected={flt?.grp === 'pRight' ? flt.key : null}
                    onSelect={(k) => pickFlt({
                      grp: 'pRight', key: k, label: tr('Эрх: {0}', labelOf(d.pRight, k)),
                      where: whereOf(d.pRight, k), only: ['gazar:parcel'],
                    })}
                  />
                )}
                {d.pUse.length > 0 && (
                  <>
                    <p className={g.subHead}>{tr('Зориулалтаар')}</p>
                    {/* envhub: Bars нь ГАНЦ өгөгдлийн өнгөөр — ялгааг дараалал, хэмжээ өгнө */}
                    <Bars
                      items={d.pUse.map((x) => ({ ...x, color: 'var(--data)' }))} inline limit={5}
                      selected={flt?.grp === 'pUse' ? flt.key : null}
                      onSelect={(k) => pickFlt({
                        grp: 'pUse', key: k, label: tr('Зориулалт: {0}', k),
                        where: whereOf(d.pUse, k), only: ['gazar:parcel'],
                      })}
                    />
                  </>
                )}
              </>
            ))}
          </div>
        </section>
        </>)}
      </div>
      )}
    </div>
  );
}
