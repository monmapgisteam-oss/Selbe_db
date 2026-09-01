'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { MapCanvas, useMap, type Dim } from '@/components/MapCanvas';
import { MapTools, MapToolBtn } from '@/components/MapTools';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { useLayerPicks } from '@/lib/useLayerPicks';
import { useZoomToFilter } from '@/lib/useZoomToFilter';
import { usePlanTotals } from '@/lib/totals';
import { Stats, Stat, Donut, Bars, Ring, Empty, Loading } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import {
  queryStats, queryGroup, groups, count, sum, avg, type Aoi, type Row,
} from '@/lib/query';
import {
  GAZAR_BUILDING, GAZAR_PARCEL, PARCEL_LEFT,
  BUILDING, LAYER_BY_ID, PKG_BY_BAGTS, bagtsKey,
} from '@/lib/services';
import { overlapLeftParcels } from '@/lib/parcelOverlap';
import { cached } from '@/lib/live';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { useAuth } from '@/components/AuthGate';
import { PARCEL_OID, parcelWhere } from '@/lib/parcelEdit';
import { GazarEdit } from './GazarEdit';
import { queryFeatures } from '@/lib/query';
import { Section } from '@/components/ui';
import { num, text, shades, CAT_LIGHT, NO_DATA } from '@/lib/format';
import o from './gazarOv.module.css';
import { SplitGrip, useSideResize } from '@/components/SplitGrip';
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
 *
 * ⚠️ Полигон зурахад 3 service ижил талбайгаар шүүгдэнэ (`aoi`), гаднахыг
 * featureEffect-ээр бүдгэрүүлнэ. Полигонгүй үед service бүрийн нийт дүн.
 */

/* ══════════════════ СААД — БАГЦААР ══════════════════ */

/** Чартын нэг мөр: багц, түүний давхаргууд, давхцсан талбарын OID-ууд */
type PkgOverlap = {
  key: string;
  name: string;
  layerIds: string[];
  /** Барилгын багцад блокийн OID шүүлт; дэд бүтцийн багцад `null` */
  where: string | null;
  oids: number[];
};

/** Барилгын блокийн давхарга — багц бүрийн блокууд эндээс */
const BLOCK_LAYER = 'mon:building';
/** Газар чөлөөлөлтийн нэгж талбарын давхарга — саадыг үүн дээр тэмдэглэнэ */
const PARCEL_LAYER_ID = 'land:left';

/**
 * БАГЦУУДЫН ХӨНГӨН БҮРТГЭЛ — нэр, давхарга, шүүлт. ГҮЙЦЭТГЭЛГҮЙ.
 *
 * ⚠️ `Bagts.buildPacks` ЭНД ХЭРЭГЛЭХГҮЙ санаатай: тэр нь блок бүрийн
 *    гүйцэтгэл, айлын тоо, дундажийг шаарддаг тул `useBuildings()` дамжин
 *    10 бөглөх хуудасны түүхийг (`loadBlockProgress`) татна. Газрын
 *    харагдацад биет явц ОГТ хэрэггүй — багцын нэр, давхарга л хэрэгтэй.
 *    Тиймээс барилгын давхаргаас ганц хөнгөн асуулгаар угсарна.
 *
 * ⚠️ Дэд бүтцийн багц нь давхаргын бүртгэлээс (`PKG_BY_BAGTS`) шууд гарна —
 *    сүлжээний хүсэлт огт шаардлагагүй.
 */
const loadPkgOverlaps = cached<PkgOverlap[]>(loadPkgOverlapsRaw, undefined, ['PARCEL_LEFT']);

/**
 * ⚠️ КЭШЛЭГДСЭН (2026-08-31, гүйцэтгэлийн засвар). Энэ функц 55 багц бүрд
 * геометрийн ОГТЛОЛЦЛЫН хүсэлт явуулдаг — харагдацын хамгийн үнэтэй ажил.
 * Урьд нь `useAsync(loadPkgOverlaps, [])` гэж шууд дамжуулагдсан тул:
 *   · харагдац руу ОРОХ БҮРД (өөр рүү очоод буцахад ч) бүхэлдээ дахин ажиллана;
 *   · нэгж талбар хадгалах бүрд `useAsync`-ийн `bus` шинэчлэгдэж дахин ажиллана.
 * Одоо кэш нь `PARCEL_LEFT` түлхүүрт бүртгэгдсэн: дахин орох нь ҮНЭГҮЙ, харин
 * төлөв өөрчлөгдөхөд л шинэчлэгдэнэ — яг хэрэгтэй үедээ.
 */
async function loadPkgOverlapsRaw(): Promise<PkgOverlap[]> {
  const F = BUILDING.fields;
  const rows = await queryFeatures(BUILDING.url, {
    outFields: [BUILDING.oid, F.bagts],
    limit: 2000,
  }).catch(() => [] as Row[]);

  /* Барилгын багц — блокуудыг багцаар нь бүлэглэж OID шүүлт болгоно */
  const byName = new Map<string, number[]>();
  for (const r of rows) {
    const name = text(r[F.bagts], '').trim();
    const oid = Number(r[BUILDING.oid]);
    if (!name || !Number.isFinite(oid)) continue;
    const a = byName.get(name);
    if (a) a.push(oid); else byName.set(name, [oid]);
  }
  const build: Omit<PkgOverlap, 'oids'>[] = [...byName].map(([name, oids]) => ({
    key: bagtsKey(name),
    name,
    layerIds: [BLOCK_LAYER],
    where: `${BUILDING.oid} IN (${oids.join(',')})`,
  }));

  /* Дэд бүтцийн багц — давхаргын гарчгуудын НИЙТЛЭГ хэсгийг нэр болгоно */
  const infra: Omit<PkgOverlap, 'oids'>[] = Object.entries(PKG_BY_BAGTS).map(([key, ids]) => ({
    key,
    name: ids.length ? (LAYER_BY_ID[ids[0]]?.title ?? key) : key,
    layerIds: ids,
    where: null,
  }));

  const all = [...build, ...infra];
  /* ⚠️ Багц бүрд ТУСДАА огтлолцол; нэг нь унавал бусад нь үлдэнэ (allSettled) */
  const res = await Promise.allSettled(
    all.map((pk) => overlapLeftParcels(pk.layerIds.map((id) => ({ layerId: id, where: pk.where })))),
  );
  return all
    .map((pk, i) => {
      const r = res[i];
      return { ...pk, oids: r.status === 'fulfilled' ? r.value.oids : [] };
    })
    .filter((x) => x.oids.length > 0)
    .sort((a, b) => b.oids.length - a.oids.length
      || a.name.localeCompare(b.name, 'mn', { numeric: true }));
}

/**
 * БАГЦ БҮР ДЭЭР ДАВХЦАЖ БУЙ ҮЛДСЭН НЭГЖ ТАЛБАР — газрын зургийн ДООД зурвас.
 *
 * ⚠️ ЯАГААД ЭНЭ ХАРАГДАЦАД: «үлдсэн нэгж талбар» нь ГАЗРЫН сэдэв. Багцын
 *    гүйцэтгэлийн цонхонд байрлуулах оролдлого 2026-08-27-нд хийгдээд
 *    хэрэглэгчийн шийдвэрээр ЭНД шилжсэн — тэнд газрын өгөгдөл нь харь
 *    зочин байсан бөгөөд 55 багцын огтлолцол тэр цонхны бусад картыг
 *    хойшлуулж байв.
 *
 * ⚠️ ЗӨВХӨН СААДТАЙ багц жагсаана (`loadPkgOverlaps` шүүсэн): 55 багцын
 *    дийлэнх нь 0 тул бүгдийг зурвал жинхэнэ саад тэг баганын дунд алга болно.
 *
 * ⚠️ Мөр дарахад ЗУРАГ тэр багцын талбарууд руу очиж, багцын ӨӨРИЙН давхарга
 *    хамт асна — «хаана» гэдгээс гадна «ЮУНД саад болж байгааг» харуулна.
 */
function OverlapBars({
  q,
  selected,
  onPick,
}: {
  q: ReturnType<typeof useAsync<PkgOverlap[]>>;
  selected: string | null;
  onPick: (pk: PkgOverlap | null) => void;
}) {
  if (q.state === 'loading') {
    return (
      <Section title={tr('Саад — багцаар')}>
        <Loading label={tr('Давхцлыг тоолж байна…')} />
      </Section>
    );
  }
  if (q.state !== 'ready') {
    return (
      <Section title={tr('Саад — багцаар')}>
        <Empty label={tr('Давхцлыг тоолж чадсангүй.')} />
      </Section>
    );
  }
  const rows = q.data;
  if (!rows.length) {
    return (
      <Section title={tr('Саад — багцаар')}>
        <Empty label={tr('Аль ч багц дээр давхцсан үлдсэн нэгж талбар алга.')} />
      </Section>
    );
  }
  const total = rows.reduce((a, r) => a + r.oids.length, 0);
  return (
    <Section
      title={tr('Саад — багцаар')}
      note={<span style={{ color: 'var(--bad-ink)' }}>{tr('{0} багц · {1} талбар', num(rows.length), num(total))}</span>}
    >
      <Bars
        color="var(--bad)"
        max={Math.max(1, ...rows.map((r) => r.oids.length))}
        /* ⚠️ Эхний 12 — доод зурвас нь тогтмол өндөртэй; үлдсэнийг товчоор */
        limit={12}
        selected={selected}
        onSelect={(k) => {
          const r = rows.find((x) => x.key === k);
          onPick(r && r.key !== selected ? r : null);
        }}
        items={rows.map((r) => ({
          key: r.key,
          label: tr(r.name),
          value: r.oids.length,
          display: tr('{0} талбар', num(r.oids.length)),
        }))}
      />
    </Section>
  );
}

/** Газрын зурагт харагдах давхаргууд — чөлөөлөлт + барилга/кадастр.
 *  (Хилүүд `khil1`/`khil2` нь `ALWAYS_ON_IDS`-ээр автоматаар ил тул энд бичихгүй.) */
const VISIBLE_IDS = ['gazar:parcel', 'gazar:building', 'land:left'];
/** Полигоноор ШҮҮГДЭХ давхаргууд — featureEffect (бүдгэрүүлэлт) зөвхөн эдгээрт */
const FILTER_IDS = ['land:left', 'gazar:building', 'gazar:parcel'];

/** `Tuluv` төлөв → өнгө ба нэр (нэгтгэсэн үйлчилгээний гол ангилал).
 *  ⚠️ envhub: ӨНГӨ = УТГА. «Бүрэн чөлөөлсөн» нь жинхэнэ САЙН төлөв тул
 *  var(--good), «Үлдсэн» нь барилгад саад буй муу төлөв тул var(--bad),
 *  завсрын «Цэвэрлэсэн» нь төвийг сахисан өгөгдлийн өнгө var(--data).
 *  Урьдын чимэглэлийн hex (#22c55e/#0ea5e9/#e11d48) хасагдсан. */
const STATUS_META = [
  /* ⚠️ value = өгөгдлийн ТҮҮХИЙ утга (Tuluv) — tr()-ээр ОРЧУУЛАХГҮЙ: smap-ийн
     түлхүүр түүхий тул EN горимд tr() утгаар хайвал таарахгүй, чөлөөлөлт 0%
     болдог байв. Зөвхөн шошго (label) орчуулагдана. */
  { value: 'Бүрэн чөлөөлсөн', label: tr('Бүрэн чөлөөлсөн'), color: 'var(--good)' },
  { value: 'Цэвэрлэсэн нэгж талбар', label: tr('Цэвэрлэсэн'), color: 'var(--data)' },
  { value: 'Үлдсэн нэгж талбар', label: tr('Үлдсэн'), color: 'var(--bad)' },
] as const;

/**
 * ⚠️ Статус баганыг ХАТУУ 3-аар БИШ, өгөгдлөөс ШУУД угсарна. Эх сервист
 * мэдэгдэж буй 3-аас ГАДНА төлөв (жишээ нь «Гэрээлсэн») эсвэл хоосон утга гарч
 * ирвэл тэдгээр талбарууд «Нийт»-д тоологдоод график дээр АЛГА болж, баганы
 * нийлбэр нийт дүнд хүрэхгүй байв. Эдгээр map нь мэдэгдэж буй төлөвүүдэд тогтмол
 * нэр/өнгө/дараалал өгч, бусдыг нь автоматаар доор нэмнэ — баганууд «Нийт»-тэй
 * ҮРГЭЛЖ тэнцэнэ (шинэ/устсан төлөвт өөрөө зохицно). */
const STATUS_ORDER: string[] = STATUS_META.map((m) => m.value);
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_META.map((m) => [m.value, m.label]));
const STATUS_COLOR: Record<string, string> = Object.fromEntries(STATUS_META.map((m) => [m.value, m.color]));

/** Donut-ийн зүсмэгийн палитр — ГАНЦ өгөгдлийн өнгөний (Сэлбэ teal) сүүдэр */
/**
 * ⚠️ envhub: өгөгдлийн ГАНЦ өнгө (var(--data)). Урьд нь энэ харагдацын НОГООН
 * identity-ийн (CAT_LIGHT[3]) уусгалт байсныг --data-гийн эх болох Сэлбэ teal
 * (CAT_LIGHT[0]) руу шилжүүлэв — Dashboard-ын `shade(ACCENT…)`-тэй ижил хэв.
 * Зүсмэгүүд утга ялгаагүй тул нэг өнгөний сүүдрээр (зөвхөн Donut-д) зааглагдана;
 * Bars нь бүр ганц var(--data)-гаар зурагдана.
 */
const PALETTE = shades(CAT_LIGHT[0], 10);

/** м² → га */
const ha = (m2: number) => num(m2 / 10_000, 2);

/**
 * ₮ дүн — БҮТНЭЭР, мянгатын таслалтай. `Stat` нь утга/нэгжийг тусад нь
 * байрлуулдаг тул хос буцаана.
 * ⚠️ 2026-09-01: урьд нь «их наяд / тэрбум / сая» гэж товчилдог байв —
 *    хэрэглэгчийн шийдвэрээр бүх мөнгөн дүн бүтнээр. Товчлолыг бүү сэргээ.
 */
const money = (v: number): { v: string; unit: string } => ({ v: num(v), unit: '₮' });

/** Бүлэглэсэн мөрүүд → диаграмын зүсмэгүүд (өнгө автоматаар, тоо НЭГЖТЭЙ) */
function toItems(rows: Row[], field: string, valueKey: string, unit = tr('ш')) {
  return groups(rows, field, tr('Тодорхойгүй'), [valueKey]).map((grp, i) => ({
    key: grp.label || `#${i}`,
    label: grp.label,
    value: grp.values[valueKey] ?? 0,
    display: `${num(grp.values[valueKey] ?? 0)} ${unit}`,
    color: PALETTE[i % PALETTE.length],
  }));
}

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

/** Ангиллын нэр → WHERE («Тодорхойгүй» = хоосон/null) */
const eqOrNull = (field: string, label: string) =>
  label === 'Тодорхойгүй'
    ? `${field} IS NULL OR ${field} = ''`
    : `${field} = '${sq(label)}'`;

type GazarData = {
  /** `Tuluv` төлөвөөс: чөлөөлсөн (бүрэн+цэвэрлэсэн) ба үлдсэн */
  left: { n: number; area: number; cleared: number; cleaned: number; remaining: number; resolved: number };
  /** Төлөв бүрийн ТАЛБАЙ (га) — газрын зурагтай ижил өнгөөр */
  statusAreaBy: StatusBars;
  /** Үлдсэн талбарын ШАЛТГААН (явцын_мэдээ) — тоо/хувь/талбайг тус тусад нь */
  reasons: ReasonItems;
  /** ⚠️ area устсан — test_data [96]-д area_m2 талбар байхгүй */
  b: { n: number; value: number; floors: number; unitPrice: number };
  bType: ReturnType<typeof toItems>;
  bMat: ReturnType<typeof toItems>;
  p: { n: number; area: number };
  pRight: ReturnType<typeof toItems>;
  pUse: ReturnType<typeof toItems>;
};

export function Gazar({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  /** Талын багануудын өргөн — чирж тохируулна, хөтөчид хадгалагдана. */
  const side = useSideResize('gazar');
  const { setHighlight, zoomToWhere, refreshLayer } = useMap();

  const [aoi, setAoi] = useState<Aoi | null>(null);
  const [drawToken, setDrawToken] = useState(0);
  const [clearToken, setClearToken] = useState(0);
  /**
   * Кадастрын гурван давхарга нь СУУРЬ; каталогоос порталын аль ч давхаргыг
   * дээр нь нэмнэ (`useLayerPicks`).
   */
  const [visible, setVisible] = useLayerPicks(VISIBLE_IDS);
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);

  /**
   * СААД — БАГЦААР (доод зурвас). Сонголт нь ЗУРГИЙГ удирдана: тэр багцын
   * давхарга асаж, парселийн давхарга түүний талбаруудаар нарийсна.
   */
  const ovQ = useAsync(loadPkgOverlaps, []);
  const [ovPick, setOvPick] = useState<PkgOverlap | null>(null);

  /**
   * ЗАСВАРЫН ГОРИМ — «Талбар засах» товчоор асна.
   *
   * ⚠️ ГОРИМТОЙ БОЛГОСОН ШАЛТГААН: газрын зураг дээр товших нь энэ харагдацад
   *    ердийн үйлдэл (полигон зурах, багц сонгох). Товшилт бүрд маягт нээвэл
   *    зүгээр л газар харж байгаа хүнд саад болно. Горим асаалттай үед л
   *    товшилт маягт нээнэ.
   */
  const [editMode, setEditMode] = useState(false);
  const [editOid, setEditOid] = useState<number | null>(null);
  const [saved, setSaved] = useState('');

  const { user, status: authStatus } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  /**
   * ⚠️ ЗАСАХ ЭРХ ТУСДАА (`caps` → `gazar`). Газар чөлөөлөлтийг ХАРАХ нь
   *    төлөвийг нь СОЛИХ эрх биш: нэг талбарын төлөв солиход чөлөөлөлтийн хувь,
   *    давхцлын тооцоо, дашбоард, тайлан бүгд дагаж өөрчлөгдөнө.
   */
  const canEdit = useMemo(
    () => authStatus === 'off' || hasCap(user?.username, 'gazar'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, authStatus, capN],
  );

  /**
   * Сонгосон багцын давхаргууд зурагт НЭМЭГДЭНЭ.
   * ⚠️ `setVisible` рүү БИЧИХГҮЙ — тэр нь хэрэглэгчийн каталогийн сонголт;
   *    сонголт солигдох бүрд бохирдоно. Зөвхөн ГАРАЛТ дээр давхарлана.
   */
  const mapVisible = useMemo(
    () => {
      /**
       * ⚠️ ЗАСВАРЫН ГОРИМД ЗӨВХӨН НЭГЖ ТАЛБАР. Кадастр (`gazar:parcel`) ба
       * барилга (`gazar:building`) нь энэ давхаргатай бараг бүрэн давхцдаг тул
       * ил үлдээвэл товшилт тэдний аль нэг дээр буугаад маягт нээгдэхгүй, эсвэл
       * буруу объект сонгогдоно. Хилүүд (`ALWAYS_ON_IDS`) автоматаар үлдэнэ.
       */
      if (editMode) return [PARCEL_LAYER_ID];
      return ovPick ? [...new Set([...visible, ...ovPick.layerIds])] : visible;
    },
    [visible, ovPick, editMode],
  );

  /**
   * ДАВХАРГА БҮРИЙН ШҮҮЛТ — зөвхөн багц сонгосон үед.
   * ⚠️ `layerWhere` өгөгдмөгц MapCanvas нь бүсийн (zone) fallback-ийг БҮХ
   *    давхаргад алгасдаг тул сонголтгүй үед ОГТ өгөхгүй (`undefined`) —
   *    эс бөгөөс бүсээр шүүх нь чимээгүй унтарна.
   */
  const ovWhere = useMemo<Record<string, string | null> | undefined>(() => {
    if (!ovPick) return undefined;
    const w: Record<string, string | null> = {};
    for (const id of ovPick.layerIds) w[id] = ovPick.where;
    /* Газар чөлөөлөлтийн давхаргаас ЗӨВХӨН саад болж буй талбарууд */
    w[PARCEL_LAYER_ID] = `OBJECTID IN (${ovPick.oids.join(',')})`;
    return w;
  }, [ovPick]);

  /**
   * Сонгосон багцын саадууд УЛААНААР ялгарна.
   *
   * ⚠️ ЗААВАЛ мемолно. `MapCanvas` нь `memo()` бөгөөд түүний хамгийн хүнд
   * эффект (127 давхаргын renderer-ийг дахин угсардаг) `layerStyle`-ыг
   * хамааралдаа авдаг. Inline объект байхад рендер бүрд шинэ лавлагаа болж
   * memo эвдэрдэг: «Тунгалаг» гулсуурыг чирэхэд pointermove бүрд 2,119
   * объекттой нэгж талбарын renderer дахин оноогдож, зураг анивчин чирэлт
   * гацдаг байв. `ovWhere` дээрх мемо ижил зорилготой (мөн PkgProg.tsx /
   * Bagts.tsx-ийн `parcelStyle`).
   *
   * ⚠️ АНИВЧИЛТ ХАСАГДСАН (2026-08-28, хэрэглэгчийн заавар): пульс нь
   * талбаруудыг тасралтгүй томруулж жижигрүүлдэг тул хэлбэр, хэмжээг нь
   * нүдээр уншиж болохгүй болно. Улаан өнгө өөрөө хангалттай ялгана.
   */
  const parcelStyle = useMemo(
    () => (ovPick ? { [PARCEL_LAYER_ID]: { hue: '#dc2626', fill: 0.3, width: 2.1 } } : undefined),
    [ovPick],
  );

  /* Сонголт хийхэд зураг тэр талбарууд руу очно */
  const pickOverlap = useCallback((r: PkgOverlap | null) => {
    setOvPick(r);
    /* ⚠️ Анимацигүй — багц дараалан товшиход гөлгөр нислэг нь
       хойшлол мэт мэдрэгддэг (2026-08-28, хэрэглэгчийн заавар). */
    if (r) zoomToWhere(PARCEL_LAYER_ID, `OBJECTID IN (${r.oids.join(',')})`, { animate: false });
  }, [zoomToWhere]);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const catTotals = usePlanTotals(zone, catOpen);
  /**
   * ⚠️ AOI-ийн ТҮҮХИЙ геометр — `pickFlt` (deps-гүй useCallback) дотор state
   * биш ref-ээс уншина. `setHighlight` нь тодруулгыг БҮРЭН орлуулдаг тул
   * геометргүй дуудвал полигоны орон зайн бүдгэрүүлэлт алга болж, самбарын тоо
   * полигоноор шүүгдсэн атал зураг бүх талбайг тодоор харуулна.
   */
  const aoiGeomRef = useRef<__esri.Geometry | null>(null);

  /** Sketch-ээс ирсэн геометр — бүдгэрүүлэлт ба REST шүүлтийг ЗЭРЭГ тохируулна */
  const onSketch = useCallback((geom: __esri.Geometry | null) => {
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

  const startDraw = useCallback(() => setDrawToken((t) => t + 1), []);

  /**
   * ГАЗРЫН ЗУРАГ ДЭЭР ТАЛБАР ТОВШИХ.
   *
   * ⚠️ `useCallback` ЗААВАЛ: inline функц нь `memo(MapCanvas)`-ийн пропс
   *    өөрчлөгдсөн гэж үзүүлж, товшилт бүрд газрын зураг бүхэлдээ дахин
   *    баригдана (`PkgProg.onMapPick`-ийн тайлбар).
   *
   * ⚠️ ХООСОН ГАЗАР товшиход `(null, null)` ирнэ — сонголтыг ЦЭВЭРЛЭНЭ,
   *    `return` хийж хуучин тодруулгыг үлдээхгүй.
   *
   * ⚠️ ЗӨВХӨН OID-г авна. `onPick`-ийн атрибут нь давхаргын `outFields`-д
   *    ачаалагдсанаар хязгаарлагдах тул маягт нь мөрөө ӨӨРӨӨ бүтнээр татна.
   */
  const onMapPick = useCallback((a: Record<string, unknown> | null, id: string | null) => {
    if (!editMode) return;
    if (!a || id !== PARCEL_LAYER_ID) { setEditOid(null); setHighlight(null); return; }
    const oid = Number(a[PARCEL_OID]);
    if (!Number.isFinite(oid)) { setEditOid(null); return; }
    setEditOid(oid);
    setHighlight(parcelWhere(oid), PARCEL_LAYER_ID);
  }, [editMode, setHighlight]);

  const closeEdit = useCallback(() => { setEditOid(null); setHighlight(null); }, [setHighlight]);

  /** Засварын горимоос бүрэн гарах — маягт, тодруулга хоёулаа цэвэрлэгдэнэ */
  const exitEdit = useCallback(() => {
    setEditMode(false);
    setEditOid(null);
    setHighlight(null);
  }, [setHighlight]);

  /**
   * Чарт-шүүлт — бар/зүсмэг дарахад холбогдох давхаргад тодруулга тавина.
   * Ижил мөрийг дахин дарвал арилна. Полигон (AOI) шүүлттэй ЗЭРЭГ биш —
   * сүүлд хийсэн үйлдэл нь тодруулгыг эзэмшинэ.
   */
  const [flt, setFlt] = useState<GFlt | null>(null);
  // Шүүлт солигдоход зураг тэр объектууд руу нисэнэ
  useZoomToFilter({ zone, layerId: flt?.only?.[0] ?? null, where: flt?.where ?? null });
  const fltRef = useRef<GFlt | null>(null);
  fltRef.current = flt;
  // ⚠️ setState-ийн updater ДОТОР setHighlight дуудаж болохгүй (React render
  //    дундуур өөр компонент шинэчилнэ) — тул ref-ээс уншиж ГАДНА нь дуудна.
  /**
   * ЗАСВАРЫН ГОРИМД ОРОХ.
   *
   * ⚠️ ИДЭВХТЭЙ ШҮҮЛТҮҮДИЙГ ЗААВАЛ ЦЭВЭРЛЭНЭ. Багц сонгосон байхад
   * `ovWhere` нь `land:left` давхаргыг «OBJECTID IN (…)» гэж НАРИЙСГАДАГ —
   * тэр үед засварын горимд ЗӨВХӨН тэр багцын саад болж буй талбарууд
   * зурагдаж, бусад талбар дээр товшиход ЮУ Ч БОЛОХГҮЙ. Хэрэглэгч «засвар
   * ажиллахгүй байна» гэж дүгнэнэ. Чартын шүүлт ба полигоны бүдгэрүүлэлт
   * мөн адил төөрөгдүүлнэ.
   */
  const enterEdit = useCallback(() => {
    setOvPick(null);
    setFlt(null);
    fltRef.current = null;
    setHighlight(null);
    setEditOid(null);
    setEditMode(true);
  }, [setHighlight]);

  const pickFlt = useCallback((next: GFlt) => {
    const cur = fltRef.current;
    const val = cur && cur.grp === next.grp && cur.key === next.key ? null : next;
    setFlt(val);
    // ⚠️ AOI идэвхтэй бол геометрийг ҮРГЭЛЖ хамт дамжуулна: сонгоход SQL +
    //    орон зайн шүүлт AND-ээр хослоно (MapCanvas-ийн featureEffect тэгж
    //    хослуулдаг), цуцлахад полигоны бүдгэрүүлэлт сэргэнэ.
    const geom = aoiGeomRef.current ?? undefined;
    setHighlight(
      val ? val.where : null,
      val ? val.only : (geom ? FILTER_IDS : undefined),
      geom,
    );
  }, [setHighlight]);

  const clear = useCallback(() => {
    setClearToken((t) => t + 1);
    setAoi(null);
    aoiGeomRef.current = null; // ⚠️ хоцорсон геометр pickFlt-д дахин орох ёсгүй
    setFlt(null);
    setHighlight(null);
  }, [setHighlight]);

  const aoiKey = aoi ? JSON.stringify(aoi.geometry) : 'all';

  const q = useAsync<GazarData>(async () => {
    const area = aoi ?? undefined;
    const L = PARCEL_LEFT;
    const B = GAZAR_BUILDING;
    const P = GAZAR_PARCEL;
    const [lStat, lStatus, lReason, bStat, bType, bMat, pStat, pRight, pUse] = await Promise.all([
      queryStats(L.url, [count('OBJECTID', 'n'), sum(L.fields.area, 'area')], '1=1', area),
      // ТӨЛӨВ (Tuluv) бүрд ТОО ба ТАЛБАЙ — нэгтгэсэн үйлчилгээний гол ангилал
      queryGroup(L.url, L.fields.status, [count('OBJECTID', 'n'), sum(L.fields.area, 'a')], '1=1', area),
      // ҮЛДСЭН талбарын ШАЛТГААН — зөвхөн `Tuluv='Үлдсэн'`-т `явцын_мэдээ` бүрд тоо+талбай
      queryGroup(
        L.url, L.fields.progress, [count('OBJECTID', 'n'), sum(L.fields.area, 'a')],
        `${L.fields.status}='Үлдсэн нэгж талбар'`, area,
      ),
      // ⚠️ area_m2 талбар test_data [96]-д устсан тул талбайн нийлбэр асуухгүй
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
    // ТӨЛӨВ бүрийг ӨГӨГДЛӨӨС нэгтгэнэ (арын зай арилгаж, хоосон/null = «Тодорхойгүй»).
    // Хатуу 3 биш тул нэг ч талбар графикаас гээгдэхгүй — баганууд «Нийт»-тэй тэнцэнэ.
    const smap = new Map<string, { n: number; a: number; raws: Set<string> }>();
    for (const r of lStatus) {
      const raw = String(r[L.fields.status] ?? ''); // түүхий утга — WHERE-д яг таарна
      let k = text(r[L.fields.status]).trim();
      if (!k || k === '—') k = 'Тодорхойгүй'; // түүхий түлхүүр — дэлгэцэд tr()
      const cur = smap.get(k) ?? { n: 0, a: 0, raws: new Set<string>() };
      cur.n += Number(r.n ?? 0);
      cur.a += Number(r.a ?? 0);
      if (raw.trim() !== '') cur.raws.add(raw);
      smap.set(k, cur);
    }
    const st = (value: string) => smap.get(value) ?? { n: 0, a: 0, raws: new Set<string>() };
    const cleared = st('Бүрэн чөлөөлсөн');
    const cleaned = st('Цэвэрлэсэн нэгж талбар');
    const remaining = st('Үлдсэн нэгж талбар');
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
        // ⚠️ Дарж шүүхэд WHERE-ийг ТҮҮХИЙ утгуудаас (шалтгааны шүүлттэй ижил) угсарна:
        //    түлхүүр нь арын зай арилгасан хувилбар тул `Tuluv = '<trim>'` нь зай-мэдрэг
        //    сан дээр таарахгүй байж болзошгүй. Тодорхойгүй = NULL/хоосон.
        const eq = [...s.raws].filter((x) => x.trim() !== '')
          .map((x) => `${L.fields.status} = '${sq(x)}'`);
        const where = value === 'Тодорхойгүй'
          ? `(${L.fields.status} IS NULL OR ${L.fields.status} = '')`
          : eq.length ? `(${eq.join(' OR ')})` : `${L.fields.status} = '${sq(value)}'`;
        // Тоо ба нэгж (га) ХАМТ — «1,703 талбар · 78.08 га»
        return {
          key: value,
          label: STATUS_LABEL[value] ?? tr(value),
          value: ha2,
          display: tr('{0} талбар · {1} га', num(s.n), num(ha2, 2)),
          // Гэнэтийн шинэ төлөв — утга нь үл мэдэгдэх тул төвийг сахисан өгөгдлийн өнгө
          color: STATUS_COLOR[value] ?? (value === 'Тодорхойгүй' ? NO_DATA : 'var(--data)'),
          where,
        };
      });
    // Шалтгааны нэрийг цэвэрлэж (арын зай, төгсгөлийн «.») нэгтгэнэ.
    // ⚠️ Түүхий утгуудыг мөн хадгална — дарж шүүхэд WHERE яг таарах ёстой.
    const rmap = new Map<string, { n: number; a: number; raws: Set<string> }>();
    for (const r of lReason) {
      const raw = String(r[L.fields.progress] ?? '');
      let k = text(r[L.fields.progress]).trim().replace(/\.$/, '').trim();
      if (!k || k === '—') k = 'Тодорхойгүй'; // түүхий түлхүүр — дэлгэцэд tr()
      const cur = rmap.get(k) ?? { n: 0, a: 0, raws: new Set<string>() };
      cur.n += Number(r.n ?? 0);
      cur.a += Number(r.a ?? 0);
      cur.raws.add(raw);
      rmap.set(k, cur);
    }
    const remN = remaining.n || 1;
    const reasons: ReasonItems = [...rmap.entries()]
      .sort((x, y) => y[1].n - x[1].n)
      .map(([label, v]) => {
        const eq = [...v.raws].filter((x) => x.trim() !== '')
          .map((x) => `${L.fields.progress} = '${sq(x)}'`);
        if (label === 'Тодорхойгүй') eq.push(`${L.fields.progress} IS NULL`, `${L.fields.progress} = ''`);
        return {
          key: label,
          label,
          n: v.n,
          pct: Math.round((v.n / remN) * 100),
          area: Math.round(v.a / 100) / 100,
          // ⚠️ envhub: шалтгаанууд бүгд «үлдсэн» бүлгийн ДОТООД ангилал — сайн/муу
          //    утга заахгүй тул ганц өгөгдлийн өнгө; «Тодорхойгүй» нь саарал бэх.
          //    (Урьдын PARCEL_PROGRESS_HUES солонго нь чимэглэл болж байсан.)
          color: label === 'Тодорхойгүй' ? NO_DATA : 'var(--data)',
          // Шалтгаан нь зөвхөн ҮЛДСЭН талбарт хамаатай тул төлөвөөр хамт хязгаарлана
          where: `${L.fields.status}='Үлдсэн нэгж талбар' AND (${eq.join(' OR ')})`,
        };
      });
    return {
      left: {
        n: Number(lStat.n ?? 0),
        area: Number(lStat.area ?? 0),
        cleared: cleared.n,
        cleaned: cleaned.n,
        remaining: remaining.n,
        resolved: cleared.n + cleaned.n,
      },
      statusAreaBy,
      reasons,
      b: {
        n: Number(bStat.n ?? 0),
        value: Number(bStat.val ?? 0), floors: Number(bStat.fl ?? 0),
        unitPrice: Number(bStat.up ?? 0),
      },
      bType: toItems(bType, B.fields.type, 'n', tr('барилга')),
      bMat: toItems(bMat, B.fields.material, 'n', tr('барилга')),
      p: { n: Number(pStat.n ?? 0), area: Number(pStat.area ?? 0) },
      pRight: toItems(pRight, P.fields.right, 'n', tr('нэгж')),
      pUse: toItems(pUse, P.fields.landuse, 'n', tr('нэгж')),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aoiKey]);

  const d = q.state === 'ready' ? q.data : null;
  const err = q.state === 'error';
  const pct = d && d.left.n ? (d.left.resolved / d.left.n) * 100 : null;

  /** Панелийн агуулгыг ачаалал/алдаа/хоосонтой хамт зурна */
  const guard = (ready: boolean, body: React.ReactNode) =>
    d ? (ready ? body : <Empty label={tr('Мэдээлэл алга')} />)
      : err ? <Empty label={tr('Алдаа гарлаа')} /> : <Loading label={tr('Татаж байна…')} />;

  return (
    /* Талын багануудыг чирж өргөсгөх/нарийсгах бариулууд. */
    <div
      ref={side.hostRef}
      className={`${g.frame} ${editMode ? g.frameEdit : ''} ${side.hostClass}`}
      style={side.style}
    >
      <SplitGrip {...side.left} />
      <SplitGrip {...side.right} />
      {/*
        * ⚠️ ЗАСВАРЫН ГОРИМД ХАЖУУГИЙН БАГАНУУД БҮРЭН UNMOUNT БОЛНО.
        * Зөвхөн CSS-ээр нуувал доторх `useAsync` хүсэлтүүд харагдахгүй атлаа
        * ажилласаар байх бөгөөд хадгалсны дараах `invalidate` тэднийг дахин
        * татна — засвар хийж буй хүнд хэрэггүй сүлжээний ачаалал.
        *
        * ⚠️ Газрын зураг ӨӨРӨӨ unmount БОЛОХГҮЙ: хоёр дахь ArcGIS view үүсгэвэл
        * WebGL контекст үрэгдэнэ. Тиймээс «шинэ цонх» гэдэг нь БАЙГАА зургаа
        * дэлгэц дүүрэн болгосон хэлбэр — томруулсан байрлал ч хэвээр үлдэнэ.
        */}
      {!editMode && (
      /* ── ЗҮҮН: Чөлөөлөлт (үлдсэн нэгж талбар) — үзүүлэлт + явц бүгд энд ── */
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
                  <Ring value={pct} size={148} width={14} color="var(--good)" label={tr('чөлөөлсөн')} />
                  <p className={g.ringNote}>
                    <b className="num">{d ? num(d.left.resolved) : ''}</b> /{' '}
                    <span className="num">{d ? num(d.left.n) : ''}</span> {tr('талбар')}
                    <span className={g.ringSub}>{tr('бүрэн чөлөөлсөн + цэвэрлэсэн')}</span>
                  </p>
                </div>
                <p className={g.subHead}>{tr('Талбай (га) төлөвөөр')}</p>
                {/* limit БАЙХГҮЙ — бүх төлөв харагдаж, баганы нийлбэр «Нийт»-тэй тэнцэнэ */}
                <Bars
                  items={d.statusAreaBy}
                  selected={flt?.grp === 'status' ? flt.key : null}
                  onSelect={(k) => {
                    // Шалтгааны шүүлттэй ижил — item-ийн урьдчилан угсарсан (түүхий утгат) WHERE-ийг авна
                    const it = d.statusAreaBy.find((x) => x.key === k);
                    if (it) pickFlt({ grp: 'status', key: k, label: tr('Төлөв: {0}', k), where: it.where, only: ['land:left'] });
                  }}
                />
                {d.reasons.length > 0 && (() => {
                  const selReason = flt?.grp === 'reason' ? flt.key : null;
                  const pickReason = (k: string) => {
                    const r = d.reasons.find((x) => x.key === k);
                    if (r) pickFlt({ grp: 'reason', key: k, label: tr('Шалтгаан: {0}', k), where: r.where, only: ['land:left'] });
                  };
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
      <main className={g.map}>
        <MapCanvas
          dim={dim}
          visible={mapVisible}
          opacity={opacity}
          zone={zone}
          layerWhere={ovWhere}
          layerStyle={parcelStyle}
          uniform
          sketch
          onSketch={onSketch}
          drawToken={drawToken}
          clearToken={clearToken}
          onPick={onMapPick}
        />

        {editOid != null && (
          <GazarEdit
            oid={editOid}
            canEdit={canEdit}
            onCancel={closeEdit}
            onDone={(n) => {
              closeEdit();
              /**
               * ⚠️ ДАВХАРГЫГ ДАХИН УНШУУЛНА. FeatureLayer нь татсан объектоо
               * клиент дээрээ кэшлэдэг бөгөөд бичилт нь SDK-аар биш ШУУД
               * REST-ээр явсан тул зассан талбар ХУУЧИН ӨНГӨӨРӨӨ үлдэнэ.
               * Үүнгүй бол хэрэглэгч «хадгалагдсангүй» гэж бодоод бүтэн
               * хуудсаа refresh хийнэ — газрын зураг, бүх өгөгдөл дахин ачаална.
               */
              if (n > 0) refreshLayer(PARCEL_LAYER_ID);
              /* ⚠️ 0 нь АМЖИЛТГҮЙ биш — юу ч өөрчлөөгүй гэсэн үг. Хоёрыг нэг
                 мессежээр хэлбэл «хадгалагдсангүй» гэж уншигдана. */
              setSaved(n > 0
                ? tr('{0} талбар хадгалагдлаа', num(n))
                : tr('Өөрчлөлт байсангүй'));
              window.setTimeout(() => setSaved(''), 4000);
            }}
          />
        )}

        {/* ⚠️ 2026-08-20: Урьд нь ЭНД зөвхөн 2D/3D/BIM + «Полигон зурах» байв —
            Давхарга ч, Тунгалаг ч, Бүс ч байхгүй тул кадастрын гурван давхаргаас
            цааш юу ч нэмж харах боломжгүй байлаа. Одоо нэгдсэн зурвас, зурах
            товчнууд нь түүний ДОТОР (`children`) ижил загвараар. */}
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
            disabled={dim !== '2d'}
            title={dim !== '2d' ? tr('Полигоныг зөвхөн 2D дээр зурна') : tr('Газар дээр полигон зурах')}
          >
            {aoi ? tr('Дахин зурах') : tr('Полигон зурах')}
          </MapToolBtn>
          {aoi && <MapToolBtn onClick={clear}>{tr('Цэвэрлэх')}</MapToolBtn>}
          {/* ⚠️ Эрхгүй хүнд ОГТ харагдахгүй — идэвхгүй товч нь «яагаад
              болохгүй байна» гэсэн асуулт төрүүлээд хариулахгүй. */}
          {canEdit && (
            <MapToolBtn
              icon="pen"
              on={editMode}
              disabled={dim !== '2d'}
              onClick={() => (editMode ? exitEdit() : enterEdit())}
              title={dim !== '2d'
                ? tr('Засварыг зөвхөн 2D дээр хийнэ')
                : tr('Зөвхөн газрын зураг үлдэж, талбар дарахад төлөв солих цонх нээгдэнэ')}
            >
              {tr('Талбар засах')}
            </MapToolBtn>
          )}
        </MapTools>

        {/*
          * ЗАСВАРЫН АЖЛЫН ЗУРВАС — «энэ бол тусдаа цонх» гэдгийг хэлнэ.
          * Хажуугийн багана, доод зурвас нь unmount болсон тул зөвхөн зураг
          * үлдэж, энэ зурвас нь гарчиг ба гарах замыг өгнө.
          */}
        {editMode && (
          <div className={g.editBar}>
            <span className={g.editTitle}>{tr('Нэгж талбар засах')}</span>
            <span className={g.editHint}>
              {tr('Газрын зураг дээр нэгж талбар дарна уу')}
            </span>
            <button type="button" className={g.editClose} onClick={exitEdit}>
              {tr('Хаах')}
            </button>
          </div>
        )}
        {saved && <p className={g.saved} role="status">{saved}</p>}

        {catOpen && (
          <div className={o.catPanel}>
            <LayerCatalog
              view="gazar"
              totals={catTotals}
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

        <div className={`${g.scope} ${aoi ? g.scopeSel : ''}`}>
          <span className={g.scopeDot} aria-hidden />
          <span className={g.scopeText}>{aoi ? tr('Сонгосон талбай') : tr('Бүх талбай')}</span>
          <span className={g.scopeHint}>{aoi ? tr('полигоноор шүүсэн') : tr('полигон зурж шүүнэ')}</span>
        </div>

        {/* Чарт-шүүлтийн чип — дашбоардтай ижил, ×-ээр цуцлана */}
        {flt && (
          <div className={o.chipBar}>
            <div className={o.filterChip}>
              <span className={o.filterLabel}>{flt.label}</span>
              <button type="button" className={o.filterClear} onClick={() => pickFlt(flt)} aria-label={tr('Цуцлах')}>×</button>
            </div>
          </div>
        )}
      </main>

      {/* ── ЗУРГИЙН ДООД ЗУРВАС: багц бүрийн саад (зургийн өргөнтэй) ── */}
      {!editMode && (
      <div className={g.chart}>
        <OverlapBars q={ovQ} selected={ovPick?.key ?? null} onPick={pickOverlap} />
      </div>
      )}

      {/* ── БАРУУН: Барилга + Кадастр (нэгтгэсэн багана) ── */}
      {!editMode && (
      <div className={g.right}>
        {/* Баганын толгой — зүүнтэй ЯГ ижил envhub eyebrow (өнгөт identity байхгүй) */}
        <h3 className={g.colHd}>
          {tr('Төслийн талбайгаас гаднах нэгж талбар, барилга')}
        </h3>
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
                  <Stat value={money(d.b.value).v} unit={money(d.b.value).unit} label={tr('Нийт үнэлгээ')} />
                  <Stat value={d.b.floors ? num(d.b.floors, 1) : '—'} unit={tr('давхар')} label={tr('Дундаж өндөр')} />
                  <Stat value={d.b.unitPrice ? money(d.b.unitPrice).v : '—'} unit={d.b.unitPrice ? tr('{0}/м²', money(d.b.unitPrice).unit) : ''} label={tr('Дундаж м² үнэ')} />
                </Stats>
                {d.bType.length > 0 && (
                  <Donut
                    items={d.bType} size={112} width={17} center={num(d.b.n)} centerLabel={tr('барилга')} stack
                    selected={flt?.grp === 'bType' ? flt.key : null}
                    onSelect={(k) => pickFlt({
                      grp: 'bType', key: k, label: tr('Барилга: {0}', k),
                      where: eqOrNull(GAZAR_BUILDING.fields.type, k), only: ['gazar:building'],
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
                        where: eqOrNull(GAZAR_BUILDING.fields.material, k), only: ['gazar:building'],
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
                    items={d.pRight} size={112} width={17} center={num(d.p.n)} centerLabel={tr('нэгж')} stack
                    selected={flt?.grp === 'pRight' ? flt.key : null}
                    onSelect={(k) => pickFlt({
                      grp: 'pRight', key: k, label: tr('Эрх: {0}', k),
                      where: eqOrNull(GAZAR_PARCEL.fields.right, k), only: ['gazar:parcel'],
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
                        where: eqOrNull(GAZAR_PARCEL.fields.landuse, k), only: ['gazar:parcel'],
                      })}
                    />
                  </>
                )}
              </>
            ))}
          </div>
        </section>
      </div>
      )}
    </div>
  );
}
