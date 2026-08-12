'use client';

/**
 * ХАБЭА — Хөдөлмөрийн аюулгүй байдал, эрүүл ахуй.
 *
 * ГУРВАН эх сурвалж: ажилтан/техникийн өдрийн тайлан (Survey123 — ӨРГӨН схем,
 * гүйцэтгэгч бүр баганын бүлэгтэй), осол зөрчлийн бүртгэл (Survey123), цамхагт
 * кран (цэг, layer 50) + аюулгүйн бүс (полигон, layer 51).
 *
 * Бүтэц: ДЭЭР KPI зурвас (бүтэн өргөн), ЗҮҮНД осол зөрчлийн аналитик, ТӨВД
 * газрын зураг — бүтэц нь «Ерөнхий мэдээлэл»-тэй ЯГ ИЖИЛ (дээд-төвд Давхарга ·
 * Тунгалаг · 2D/3D/BIM нэг pill-д), БАРУУНД кран ба хүн хүч, ДООД зурваст
 * багц/компанийн харьцуулал.
 *
 * ХӨНДЛӨН ШҮҮЛТ: багцын бар дарахад бүх график, KPI, газрын зургийн гурван
 * давхарга (осол · кран · бүс) тэр багцаар ЗЭРЭГ шүүгдэнэ (`layerWhere`).
 * Зурган дээрх цэг дарахад тухайн кран/ослын дэлгэрэнгүй карт гарна.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures, sqlStr, type Row } from '@/lib/query';
import {
  HABEA, HABEA_LAYER_IDS, LAYER_BY_ID, MONITOR_LAYER_IDS, PLAN_LAYER_IDS,
  bagtsKey, laborCompanyFields,
} from '@/lib/services';
import { usePlanTotals } from '@/lib/totals';
import { Section, Bars, Donut, Series, Loading, Empty } from '@/components/ui';
import { num, date, text, shade } from '@/lib/format';
import { MapCanvas, type Dim } from '@/components/MapCanvas';
import { LayerCatalog } from '@/components/LayerCatalog';
import { OpacityPanel } from '@/components/OpacityPanel';
import { Icon } from '@/components/Icon';
import h from './habea.module.css';
import o from './overview.module.css';

const L = HABEA.labor.fields;
const I = HABEA.incident.fields;
const C = HABEA.crane.fields;

/** «Давхарга» каталогийн тоолуурт орох давхаргууд — ХАБЭА эхэнд, дараа нь контекст */
const CATALOG_IDS = [...HABEA_LAYER_IDS, ...MONITOR_LAYER_IDS, ...PLAN_LAYER_IDS];

type HabeaData = { labor: Row[]; incident: Row[]; crane: Row[]; fetchedAt: number };

const loadHabea = (): Promise<HabeaData> =>
  Promise.all([
    queryFeatures(HABEA.labor.url, { outFields: ['*'] }),
    queryFeatures(HABEA.incident.url, { outFields: ['*'] }),
    queryFeatures(HABEA.crane.url, { outFields: ['*'] }),
    // «Осолгүй хоног» render дотор Date.now() дуудаж болохгүй (react-hooks/purity)
    // тул лавлах цэг нь ӨГӨГДӨЛ ТАТСАН мөч — дахин ачаалахад шинэчлэгдэнэ.
  ]).then(([labor, incident, crane]) => ({ labor, incident, crane, fetchedAt: Date.now() }));

const nn = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Survey123-ийн бичвэрт ирдэг хашилтыг цэвэрлэнэ. Domain-ий утга 30 тэмдэгтэд
 * ТАСАРСАН байдаг (`"Нутгын буян` …) тул зах гэлтгүй БҮХ хашилтыг авна —
 * эс бөгөөс хагас хашилт үлдэнэ.
 */
const clean = (v: unknown): string => text(v, '—').replace(/["“”]/g, '').trim() || '—';

function countBy<T>(rows: T[], val: (r: T) => string) {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    const k = val(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return [...m.entries()]
    .map(([label, value]) => ({ key: label, label, value }))
    .sort((a, b) => b.value - a.value);
}

/** Эхний N ангиллыг үлдээж, үлдсэнийг «Бусад» болгож нэгтгэнэ — легенд богино байх */
function topN<T extends { key: string; label: string; value: number }>(items: T[], n: number) {
  if (items.length <= n + 1) return items;
  const rest = items.slice(n);
  return [
    ...items.slice(0, n),
    { key: '__other', label: 'Бусад', value: rest.reduce((s, x) => s + x.value, 0) },
  ] as T[];
}

/* ─────────── Осол, зөрчил ─────────── */

/**
 * Ослын төрлийн ХҮНД байдлын өнгө — domain-ий утгууд чөлөөт бичвэртэй ирдэг
 * («Амь нас эрсдэж болзошгүй байсан», «Ноцтой осол»...) тул түлхүүр үгээр
 * тааруулна. Дараалал чухал: амь нас/ноцтой нь «болзошгүй»-ээс түрүүнд.
 */
const SEVERITY: [RegExp, string][] = [
  [/амь|ноцтой|үйлдвэрлэлийн/i, '#dc2626'],
  [/гал/i, '#b91c1c'],
  [/эмнэлг|гэмтэл|тусламж/i, '#ea580c'],
  [/эд хөрөнг|өмч|хохирол/i, '#f59e0b'],
  [/дөхсөн|болзошгүй/i, '#eab308'],
];
const severityHue = (label: string) => SEVERITY.find(([re]) => re.test(label))?.[1] ?? '#94a3b8';

/** Давхардсан өнгөтэй зүсмэгүүдийг shade-ээр ялгаруулна (нэг өнгө 2+ төрөлд оногдвол) */
function severityColors<T extends { label: string }>(items: T[]) {
  const seen = new Map<string, number>();
  return items.map((it) => {
    const base = it.label === 'Бусад' ? '#94a3b8' : severityHue(it.label);
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    return { ...it, color: k ? shade(base, k, 5) : base };
  });
}

type Inc = {
  oid: number; d: number; bagtsRaw: string; bagtsK: string; company: string;
  type: string; cause: string; info: string; reason: string; action: string;
};

const normIncident = (r: Row): Inc => ({
  oid: nn(r['objectid']),
  d: nn(r[I.ognoo]) || nn(r['CreationDate']),
  bagtsRaw: text(r[I.bagts], '—'),
  bagtsK: bagtsKey(r[I.bagts]),
  company: clean(r[I.company]),
  type: text(r[I.turul], '—'),
  cause: text(r[I.shaltgaanTurul], '—'),
  info: text(r[I.medeelel], '—'),
  reason: text(r[I.shaltgaan], '—'),
  action: text(r[I.argaHemjee], '—'),
});

/** Сар бүрийн бүртгэлийн тоо — эхнээс нь дуустал ЗАВСАРГҮЙ (хоосон сар = 0) */
function monthSeries(list: Inc[]) {
  if (!list.length) return [];
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const counts = new Map<string, number>();
  list.forEach((x) => {
    const k = key(new Date(x.d));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  const ds = list.map((x) => x.d);
  const cur = new Date(Math.min(...ds));
  cur.setDate(1);
  const to = new Date(Math.max(...ds));
  const out: { key: string; label: string; value: number }[] = [];
  while (cur <= to) {
    const k = key(cur);
    out.push({
      key: k,
      label: `${String(cur.getFullYear()).slice(2)}.${String(cur.getMonth() + 1).padStart(2, '0')}`,
      value: counts.get(k) ?? 0,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  // Series-ийн багана хэт олширвол уншигдахгүй — сүүлийн 18 сараар хязгаарлана
  return out.slice(-18);
}

/* ─────────── Цамхагт кран ─────────── */

const CRANE_HUE: Record<string, string> = {
  'Шинээр нэмэгдсэн': '#22c55e', 'Одоо байгаа': '#2563eb', 'Буусан': '#787878',
};

type Crane = {
  dugaar: string; blok: string; bagtsRaw: string; bagtsK: string;
  undur: number; sunUrt: number; tuluv: string;
};

const normCrane = (r: Row): Crane => ({
  dugaar: text(r[C.dugaar], '—'),
  blok: text(r[C.blok], '—'),
  bagtsRaw: text(r[C.bagts], '—'),
  bagtsK: bagtsKey(r[C.bagts]),
  undur: nn(r[C.undur]),
  sunUrt: nn(r[C.sunUrt]),
  tuluv: text(r[C.tuluv], '—'),
});

/* ─────────── Ажилтан · техник (өргөн схем) ─────────── */

const TECH: { key: 'tsamhagtKran' | 'avtoKran' | 'achaanii' | 'ekskavator' | 'kovsh' | 'usniMashin'; label: string }[] = [
  { key: 'tsamhagtKran', label: 'Цамхагт кран' },
  { key: 'avtoKran', label: 'Авто кран' },
  { key: 'achaanii', label: 'Ачааны машин' },
  { key: 'ekskavator', label: 'Экскаватор' },
  { key: 'kovsh', label: 'Ковш' },
  { key: 'usniMashin', label: 'Усны машин' },
];

type LaborRow = {
  key: string; label: string; code: string; bagtsRaw: string; bagtsK: string;
  mongol: number; gadaad: number; ajiltan: number; tehnik: number;
  tech: { key: string; label: string; value: number }[];
};

/**
 * Хүн хүч, техникийн «одоогийн байдал».
 *
 * Үндсэн зам: СҮҮЛИЙН бүртгэлээс (max огноо) гүйцэтгэгч бүрийн баганын бүлгийг
 * задлана — нэг бүртгэл өдрийн НЭГДСЭН тайлан тул нийлбэр нь тухайн өдрийн
 * бүрэн зураг. Бүх бүлэг хоосон бол (маягтыг энгийн талбараар нь бөглөсөн
 * хуучин маягийн өгөгдөл) багц тус бүрийн сүүлийн бүртгэлээс уншина.
 */
function laborState(rows: Row[]): { rows: LaborRow[]; asOf: number | null; hunTsag: number } {
  if (!rows.length) return { rows: [], asOf: null, hunTsag: 0 };
  const dOf = (r: Row) => nn(r[L.ognoo]) || nn(r['CreationDate']);
  const latest = rows.reduce((a, b) => (dOf(b) >= dOf(a) ? b : a));
  const asOf = dOf(latest) || null;

  const comp: LaborRow[] = HABEA.labor.companies
    .map((c) => {
      const f = laborCompanyFields(c.sfx);
      const mongol = nn(latest[f.mongol]);
      const gadaad = nn(latest[f.gadaad]);
      const tech = TECH.map((t) => ({ key: t.key, label: t.label, value: nn(latest[f[t.key]]) }));
      const bagtsRaw = c.bagts ?? text(latest[f.bagts], '');
      return {
        key: c.sfx, label: c.label, code: c.code, bagtsRaw, bagtsK: bagtsKey(bagtsRaw),
        mongol, gadaad,
        ajiltan: nn(latest[f.niitAjiltan]) || mongol + gadaad,
        tehnik: nn(latest[f.niitTehnik]) || tech.reduce((s, x) => s + x.value, 0),
        tech,
      };
    })
    .filter((x) => x.ajiltan > 0 || x.tehnik > 0);

  if (comp.length) return { rows: comp, asOf, hunTsag: nn(latest[L.hunTsag]) };

  // Хуучин маягийн энгийн талбарууд — багц тус бүрийн СҮҮЛИЙН бүртгэл
  const m = new Map<string, Row>();
  rows.forEach((r) => {
    const k = text(r[L.bagts], '—');
    const cur = m.get(k);
    if (!cur || dOf(r) >= dOf(cur)) m.set(k, r);
  });
  const gen: LaborRow[] = [...m.entries()]
    .map(([bagtsRaw, r]) => ({
      key: bagtsRaw, label: bagtsRaw, code: bagtsRaw, bagtsRaw, bagtsK: bagtsKey(bagtsRaw),
      mongol: nn(r[L.mongol]), gadaad: nn(r[L.gadaad]),
      ajiltan: nn(r[L.niitAjiltan]) || nn(r[L.mongol]) + nn(r[L.gadaad]),
      tehnik: nn(r[L.niitTehnik]),
      tech: TECH.map((t) => ({ key: t.key, label: t.label, value: nn(r[L[t.key]]) })),
    }))
    .filter((x) => x.ajiltan > 0 || x.tehnik > 0);
  const hunTsag = [...m.values()].reduce((s, r) => s + nn(r[L.hunTsag]), 0);
  return { rows: gen, asOf, hunTsag };
}

/* ─────────── Туслах дүрслэл ─────────── */

const kpiTile = (val: ReactNode, label: string, unit?: string) => (
  <div className={o.tile}>
    <div className={o.tileVal}><b>{val}</b>{unit && <i>{unit}</i>}</div>
    <div className={o.tileLabel}>{label}</div>
  </div>
);

/** Багцаар бүлэглэсэн нийлбэр — бар бүр bagtsKey түлхүүртэй (хөндлөн шүүлтэд) */
function byPkg<T extends { bagtsK: string; bagtsRaw: string }>(items: T[], val: (x: T) => number) {
  const m = new Map<string, { label: string; value: number }>();
  items.forEach((x) => {
    if (!x.bagtsK) return;
    const cur = m.get(x.bagtsK);
    if (cur) cur.value += val(x);
    else m.set(x.bagtsK, { label: x.bagtsRaw || '—', value: val(x) });
  });
  return [...m.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

/* ─────────── Ослын хавсаргасан зураг (attachment) ─────────── */

type Photo = { id: number; name: string };

/** Бүртгэл бүрийн хавсралтын жагсаалт — нэг удаа татаад кэшлэнэ (задлах бүрд дахин татахгүй) */
const photoCache = new Map<number, Promise<Photo[]>>();
const loadPhotos = (oid: number): Promise<Photo[]> => {
  let p = photoCache.get(oid);
  if (!p) {
    p = fetch(`${HABEA.incident.url}/${oid}/attachments?f=json`)
      .then((r) => r.json())
      .then((j: { attachmentInfos?: { id: number; contentType?: string; name?: string }[] }) =>
        (j.attachmentInfos ?? [])
          .filter((a) => String(a.contentType ?? '').startsWith('image/'))
          .map((a) => ({ id: a.id, name: a.name ?? `Зураг ${a.id}` })));
    // ⚠️ АМЖИЛТГҮЙ амлалтыг кэшлэхгүй — үлдээвэл «дахин оролдох» хэзээ ч сэргэхгүй
    p.catch(() => photoCache.delete(oid));
    photoCache.set(oid, p);
  }
  return p;
};

/**
 * Олон бүртгэлийн хавсралтыг ЦУВРАЛ багцаар татна — 17 зэрэг хүсэлт ArcGIS-ийн
 * rate limit-д өртөж бүх ханыг унагадаг байв (query.ts-ийн limiter энд үйлчлэхгүй).
 */
async function loadPhotoBatches<T>(list: Inc[], of: (i: Inc, p: Photo) => T): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < list.length; i += 4) {
    const chunk = await Promise.all(
      list.slice(i, i + 4).map((inc) => loadPhotos(inc.oid).then((ph) => ph.map((p) => of(inc, p)))),
    );
    out.push(...chunk.flat());
  }
  return out;
}

/** Бүртгэлийн хавсаргасан зургууд — дарахад бүтэн хэмжээгээр шинэ цонхонд */
function IncPhotos({ oid }: { oid: number }) {
  const q = useAsync<Photo[]>(() => loadPhotos(oid), [oid]);
  if (q.state === 'loading') return <div className={h.photoNote}>Зураг шалгаж байна…</div>;
  if (q.state === 'error') return <div className={h.photoNote}>Зураг татагдсангүй</div>;
  if (!q.data.length) return null;
  return (
    <div className={h.photos}>
      {q.data.map((p) => {
        const src = `${HABEA.incident.url}/${oid}/attachments/${p.id}`;
        return (
          <a key={p.id} href={src} target="_blank" rel="noreferrer" title={p.name}>
            {/* Хөндлөнгийн ArcGIS хавсралт тул next/image-ийн оновчлол хамаагүй */}
            <img src={src} alt={p.name} />
          </a>
        );
      })}
    </div>
  );
}

/**
 * Ослын хавсаргасан зургийн СЛАЙДЕР — тусдаа карт. Бүртгэл бүрийн хавсралтыг
 * (кэштэй `loadPhotos`) нэгтгэж, шинэ нь эхэндээ; НЭГ зураг харагдаж, ‹ ›
 * товчоор солино. Багцын шүүлтийг дагана.
 *
 * ⚠️ Индексийг эффектээр тэглэхгүй — шүүлтээр жагсаалт богиноссон үед
 * `Math.min`-ээр хязгаарт нь буцаана (setState-in-effect-ээс зайлсхийнэ).
 */
function PhotoWall({ list }: { list: Inc[] }) {
  const ids = list.map((x) => x.oid).join(',');
  const [idx, setIdx] = useState(0);
  const q = useAsync<{ src: string; cap: string; tip: string }[]>(
    () =>
      loadPhotoBatches(list, (i, p) => ({
        src: `${HABEA.incident.url}/${i.oid}/attachments/${p.id}`,
        cap: `${date(i.d)} · ${i.bagtsRaw}`,
        tip: `${i.type} — ${i.company}`,
      })),
    [ids],
  );
  if (q.state === 'loading') return <Loading label="Зураг ачаалж байна…" />;
  if (q.state === 'error') {
    return (
      <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        <Empty label="Зураг татагдсангүй" />
        {q.retry && <button type="button" className={h.retry} onClick={q.retry}>Дахин оролдох</button>}
      </div>
    );
  }
  const n = q.data.length;
  if (!n) return <Empty label="Хавсаргасан зураг алга" />;
  const cur = Math.min(idx, n - 1);
  const p = q.data[cur];
  return (
    <div>
      <div className={h.slide}>
        <button
          type="button"
          className={h.slideNav}
          disabled={n < 2}
          onClick={() => setIdx((cur - 1 + n) % n)}
          aria-label="Өмнөх зураг"
        >
          ‹
        </button>
        <a href={p.src} target="_blank" rel="noreferrer" title={p.tip} className={h.slideImg}>
          {/* Хөндлөнгийн ArcGIS хавсралт тул next/image-ийн оновчлол хамаагүй.
              ⚠️ loading="lazy" ХЭРЭГЛЭХГҮЙ — карт нь доод зурваст, viewport-аас
              гадуур тул lazy-loader асалгүй зураг хоосон үлддэг. */}
          <img src={p.src} alt={p.tip} />
        </a>
        <button
          type="button"
          className={h.slideNav}
          disabled={n < 2}
          onClick={() => setIdx((cur + 1) % n)}
          aria-label="Дараагийн зураг"
        >
          ›
        </button>
      </div>
      <div className={h.slideCap}>
        <span className={h.slideCapText}>{p.cap} · {p.tip}</span>
        <b className="num">{cur + 1}/{n}</b>
      </div>
    </div>
  );
}

/** Зурган дээрээс сонгосон объектын картын мөрүүд */
function pickRows(id: string, a: Record<string, unknown>): [string, string][] {
  if (id === 'habea:osol') {
    return ([
      ['Огноо', date((a[I.ognoo] ?? a['CreationDate']) as number)],
      ['Төрөл', text(a[I.turul], '—')],
      ['Багц', text(a[I.bagts], '—')],
      ['Компани', clean(a[I.company])],
      ['Мэдээлэл', text(a[I.medeelel], '—')],
      ['Шалтгаан', text(a[I.shaltgaan], '—')],
      ['Арга хэмжээ', text(a[I.argaHemjee], '—')],
    ] as [string, string][]).filter(([, v]) => v !== '—');
  }
  const rows: [string, string][] = [
    ['Багц', text(a[C.bagts], '—')],
    ['Блок', text(a[C.blok], '—')],
    ['Төлөв', text(a[C.tuluv], '—')],
    ['Өндөр', `${num(nn(a[C.undur]))} м`],
    ['Сумны урт', `${num(nn(a[C.sunUrt]))} м`],
  ];
  if (id === 'habea:buffer') rows.push(['Аюулгүйн радиус', `${num(nn(a['BUFF_DIST']))} м`]);
  return rows;
}

const DAY = 86_400_000;

/* ═══════════════════════ Үндсэн компонент ═══════════════════════ */

export function Habea({ dim, setDim }: { dim: Dim; setDim: (d: Dim) => void }) {
  const q = useAsync<HabeaData>(loadHabea, []);

  /* Газрын зургийн төлөв — бүтэц «Ерөнхий мэдээлэл»-тэй ИЖИЛ */
  const [visible, setVisible] = useState<string[]>([...HABEA_LAYER_IDS]);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [catOpen, setCatOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [layerSel, setLayerSel] = useState<string | null>(null);
  const totals = usePlanTotals(null, catOpen, CATALOG_IDS);

  /* Багцын хөндлөн шүүлт (bagtsKey) + зурган дээрээс сонгосон объект */
  const [pkg, setPkg] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ id: string; attrs: Record<string, unknown> } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const onPick = useCallback((attrs: Record<string, unknown> | null, layerId: string | null) => {
    setPicked(attrs && layerId?.startsWith('habea:') ? { id: layerId, attrs } : null);
  }, []);

  // Ортофотогийн анхдагч Portal-д харагдац бүрээр тогтоогддог (habea = асаалттай)

  const togglePkg = useCallback((k: string) => {
    setPkg((p) => (p === k ? null : k));
    setPicked(null);
  }, []);

  const all = q.state === 'ready' ? q.data : null;
  const inc = useMemo(() => (all ? all.incident.map(normIncident) : []), [all]);
  const cranes = useMemo(() => (all ? all.crane.map(normCrane) : []), [all]);
  const labor = useMemo(() => laborState(all ? all.labor : []), [all]);

  /**
   * Багц сонгоход давхарга бүрийн WHERE — график дээр тоолсон ЯГ тэр мөрүүдийг
   * зурагт үлдээнэ (багцын бичиглэл давхарга бүрт өөр тул түүхий утгуудаас нь
   * IN(...) угсарна). Тухайн багцад юу ч алга бол `1=0` — давхарга хоосорно.
   */
  const layerWhere = useMemo(() => {
    if (!pkg) return undefined;
    const inList = (raws: string[], field: string) => {
      const list = [...new Set(raws)];
      return list.length ? `${field} IN (${list.map(sqlStr).join(',')})` : '1=0';
    };
    const osol = inList(inc.filter((x) => x.bagtsK === pkg).map((x) => x.bagtsRaw), I.bagts);
    const kran = inList(cranes.filter((x) => x.bagtsK === pkg).map((x) => x.bagtsRaw), C.bagts);
    return { 'habea:osol': osol, 'habea:crane': kran, 'habea:buffer': kran };
  }, [pkg, inc, cranes]);

  /* Шүүгдсэн олонлогууд — багцын баруудаас БУСАД бүх дүрслэл эдгээрээс тоологдоно */
  const fInc = pkg ? inc.filter((x) => x.bagtsK === pkg) : inc;
  const fCrane = pkg ? cranes.filter((x) => x.bagtsK === pkg) : cranes;
  const fLabor = pkg ? labor.rows.filter((x) => x.bagtsK === pkg) : labor.rows;

  /* Осол, зөрчил */
  const incByType = severityColors(topN(countBy(fInc, (x) => x.type), 4));
  const incByCause = countBy(fInc.filter((x) => x.cause !== '—'), (x) => x.cause);
  const incByCompany = countBy(fInc, (x) => x.company);
  const incByPkg = byPkg(inc, () => 1);
  const months = monthSeries(fInc);
  const recent = [...fInc].sort((a, b) => b.d - a.d).slice(0, 6);
  const lastInc = fInc.length ? Math.max(...fInc.map((x) => x.d)) : null;
  const daysSince = lastInc == null || !all
    ? null
    : Math.max(0, Math.floor((all.fetchedAt - lastInc) / DAY));

  /* Кран */
  const craneByStatus = countBy(fCrane, (x) => x.tuluv)
    .map((x) => ({ ...x, color: CRANE_HUE[x.label] ?? '#94a3b8' }));
  const craneByPkg = byPkg(cranes, () => 1);
  const craneActive = fCrane.filter((x) => x.tuluv !== 'Буусан').length;
  const avgUndur = fCrane.length ? fCrane.reduce((s, x) => s + x.undur, 0) / fCrane.length : 0;
  const avgSum = fCrane.length ? fCrane.reduce((s, x) => s + x.sunUrt, 0) / fCrane.length : 0;

  /* Ажилтан · техник */
  const totalWorkers = fLabor.reduce((s, x) => s + x.ajiltan, 0);
  const mongol = fLabor.reduce((s, x) => s + x.mongol, 0);
  const gadaad = fLabor.reduce((s, x) => s + x.gadaad, 0);
  const totalTech = fLabor.reduce((s, x) => s + x.tehnik, 0);
  const workerMix = [
    { key: 'mn', label: 'Монгол', value: mongol, color: '#2563eb' },
    { key: 'fr', label: 'Гадаад', value: gadaad, color: '#0ea5e9' },
  ].filter((x) => x.value > 0);
  const techBreak = TECH
    .map((t) => ({
      key: t.key, label: t.label,
      value: fLabor.reduce((s, x) => s + (x.tech.find((y) => y.key === t.key)?.value ?? 0), 0),
    }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  /* Босоо графикт БОГИНО код — бүтэн нэр нь баганын доор багтахгүй (hover-т гарна) */
  const workersByCompany = fLabor
    .map((x) => ({ key: x.key, label: x.code, value: x.ajiltan }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);

  /* Шүүлтийн чипийн нэр — аль ч эх сурвалжийн түүхий бичиглэлээс */
  const pkgLabel = pkg
    ? [...incByPkg, ...craneByPkg, ...byPkg(labor.rows, (x) => x.ajiltan)]
        .find((x) => x.key === pkg)?.label ?? pkg
    : null;

  if (q.state === 'loading') {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <Loading label="ХАБЭА ачаалж байна…" />
      </div>
    );
  }
  if (q.state === 'error') {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
          <Empty label="ХАБЭА ачаалахад алдаа гарлаа" />
          {q.retry && (
            <button type="button" className={h.retry} onClick={q.retry}>Дахин оролдох</button>
          )}
        </div>
      </div>
    );
  }

  const surveyEmpty = <Empty label="Судалгаа бөглөгдөөгүй" />;

  return (
    <div className={h.shell}>
      {/* ── KPI зурвас — бүтэн өргөн, зургаан үзүүлэлт ── */}
      <div className={h.kpi}>
        {kpiTile(num(totalWorkers), 'Нийт ажилтан')}
        {kpiTile(pkg ? '—' : num(labor.hunTsag), 'Хүн цаг')}
        {kpiTile(num(totalTech), 'Ажиллаж буй техник')}
        {kpiTile(num(craneActive), 'Идэвхтэй кран', `/${num(fCrane.length)}`)}
        {kpiTile(num(fInc.length), 'Осол, зөрчил')}
        {kpiTile(daysSince == null ? '—' : num(daysSince), 'Сүүлийн ослоос хойш', daysSince == null ? undefined : 'хоног')}
      </div>

      {/* ── ЗҮҮН багана: осол зөрчлийн аналитик ── */}
      <div className={h.list}>
        <Section title="Осол, зөрчил — төрлөөр" note={`${num(fInc.length)} бүртгэл`} tone="primary">
          {incByType.length
            ? <Donut items={incByType} stack size={110} center={num(fInc.length)} centerLabel="нийт" />
            : <Empty label="Бүртгэл алга" />}
        </Section>
        <Section title="Сарын явц" note="бүртгэлийн тоо">
          {months.length
            ? <Series items={months} color="#ea580c" height={72} />
            : <Empty label="Бүртгэл алга" />}
        </Section>
        <Section title="Шалтгааны төрөл">
          {incByCause.length
            ? <Bars items={incByCause} color="#f59e0b" />
            : <Empty label="Бүртгэл алга" />}
        </Section>
        <Section title="Сүүлийн бүртгэлүүд" note="дарж дэлгэрэнгүй">
          {recent.length ? recent.map((x) => {
            const id = `${x.d}|${x.type}`;
            const on = expanded === id;
            return (
              <div key={id} className={h.incident}>
                <button
                  type="button"
                  className={h.incHead}
                  aria-expanded={on}
                  onClick={() => setExpanded(on ? null : id)}
                >
                  <i className={h.incDot} style={{ background: severityHue(x.type) }} />
                  <span className={h.incType}>{x.type}</span>
                  <span className={h.incDate}>{date(x.d)}</span>
                </button>
                <div className={h.incSub}>{x.bagtsRaw} · {x.company}</div>
                {on && (
                  <div className={h.incBody}>
                    {x.info !== '—' && <p>{x.info}</p>}
                    {x.reason !== '—' && <p><b>Шалтгаан:</b> {x.reason}</p>}
                    {x.action !== '—' && <p><b>Арга хэмжээ:</b> {x.action}</p>}
                    <IncPhotos oid={x.oid} />
                  </div>
                )}
              </div>
            );
          }) : <Empty label="Бүртгэл алга" />}
        </Section>
      </div>

      {/* ── ТӨВ: газрын зураг — «Ерөнхий мэдээлэл»-ийн бүтэц ЯГ ХЭВЭЭРЭЭ ── */}
      <div className={h.map}>
        <MapCanvas
          dim={dim}
          visible={visible}
          opacity={opacity}
          layerWhere={layerWhere}
          zone={null}
          onPick={onPick}
        />

        <div className={o.mapTools}>
          <button
            type="button"
            aria-pressed={catOpen}
            className={`${o.mapBtn} ${catOpen ? o.mapBtnOn : ''}`}
            onClick={() => setCatOpen((v) => !v)}
            title="Давхаргын жагсаалт"
          >
            <Icon name="layers" size={15} />
            Давхарга
          </button>
          <button
            type="button"
            aria-pressed={opOpen}
            className={`${o.mapBtn} ${opOpen ? o.mapBtnOn : ''}`}
            onClick={() => setOpOpen((v) => !v)}
            title="Давхаргын тунгалаг"
          >
            <Icon name="droplet" size={15} />
            Тунгалаг
          </button>
          <div className={o.dimsInline} role="group" aria-label="Газрын зургийн харагдац">
            {(['2d', '3d', 'bim'] as Dim[]).map((x) => (
              <button key={x} type="button" aria-pressed={dim === x}
                className={`${o.dimBtn} ${dim === x ? o.dimOn : ''}`} onClick={() => setDim(x)}>
                {x.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {catOpen && (
          <div className={o.catPanel}>
            <LayerCatalog
              view="habea"
              totals={totals}
              visible={visible}
              setVisible={setVisible}
              selected={layerSel}
              onSelect={setLayerSel}
              onClose={() => setCatOpen(false)}
              zone={null}
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

        {/* Багцын шүүлтийн чип — зүүн дээд (жагсаалт нээлттэй үед түүний ард орохгүй) */}
        {pkg && !catOpen && (
          <div className={o.chipBar}>
            <div className={o.filterChip}>
              <span className={o.filterLabel}>Багц: {pkgLabel}</span>
              <button
                type="button"
                className={o.filterClear}
                onClick={() => setPkg(null)}
                aria-label="Шүүлтийг арилгах"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Зурган дээрээс сонгосон кран/ослын дэлгэрэнгүй карт */}
        {picked && (
          <div className={h.pick}>
            <header className={h.pickHead}>
              <b>{LAYER_BY_ID[picked.id]?.title ?? 'Объект'}</b>
              <button type="button" onClick={() => setPicked(null)} aria-label="Хаах">×</button>
            </header>
            <dl className={h.pickRows}>
              {pickRows(picked.id, picked.attrs).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {picked.id === 'habea:osol' && <IncPhotos oid={nn(picked.attrs['objectid'])} />}
          </div>
        )}

        <div className={o.legend}>
          {visible.slice(0, 8).map((id) => {
            const Ld = LAYER_BY_ID[id];
            return Ld ? (
              <span key={id} className={o.legendItem} title={Ld.title}>
                <i style={{ background: Ld.hue }} />{Ld.title}
              </span>
            ) : null;
          })}
          {visible.length > 8 && <span className={o.legendMore}>+{visible.length - 8}</span>}
        </div>
      </div>

      {/* ── БАРУУН багана: кран · техник · хүн хүч ── */}
      <div className={h.r}>
        <Section title="Цамхагт кран — төлөв" note={`${num(craneActive)}/${num(fCrane.length)} идэвхтэй`}>
          {craneByStatus.length
            ? <Donut items={craneByStatus} stack size={110} center={num(fCrane.length)} centerLabel="кран" />
            : <Empty label="Бүртгэл алга" />}
          {fCrane.length > 0 && (
            <div className={h.mini}>Дундаж өндөр {num(avgUndur, 1)} м · сумны урт {num(avgSum, 1)} м</div>
          )}
        </Section>
        <Section title="Кран — багцаар" note="дарж бүгдийг шүүнэ">
          {craneByPkg.length
            ? <Bars items={craneByPkg} color="#dc2626" selected={pkg} onSelect={togglePkg} />
            : <Empty label="Бүртгэл алга" />}
        </Section>
        <Section title="Техник — төрлөөр" note={`${num(totalTech)} нэгж`}>
          {techBreak.length ? <Bars items={techBreak} color="#0891b2" /> : surveyEmpty}
        </Section>
        <Section
          title="Ажилтан — бүрэлдэхүүн"
          note={labor.asOf ? `сүүлийн бүртгэл ${date(labor.asOf)}` : undefined}
        >
          {workerMix.length
            ? <Donut items={workerMix} stack size={110} center={num(totalWorkers)} centerLabel="ажилтан" />
            : surveyEmpty}
        </Section>
      </div>

      {/* ── ДООД зурвас: багц/компанийн харьцуулал — бүтэн өргөн, хумилтгүй ── */}
      <div className={h.fin}>
        <Section title="Осол, зөрчил — багцаар" note="дарж бүгдийг шүүнэ">
          {incByPkg.length
            ? <Bars items={incByPkg} color="#ea580c" selected={pkg} onSelect={togglePkg} />
            : <Empty label="Бүртгэл алга" />}
        </Section>
        <Section title="Осол, зөрчил — компаниар">
          {incByCompany.length
            ? <Bars items={incByCompany} color="#f59e0b" />
            : <Empty label="Бүртгэл алга" />}
        </Section>
        <Section title="Ажилтан — гүйцэтгэгчээр" note={`Монгол ${num(mongol)} · Гадаад ${num(gadaad)}`}>
          {workersByCompany.length
            ? <Series items={workersByCompany} color="#2563eb" height={110} unit="ажилтан" />
            : surveyEmpty}
        </Section>
        <Section title="Осол, зөрчлийн зураг" note="хавсаргасан зургууд · дарж томруулна">
          <PhotoWall list={[...fInc].sort((a, b) => b.d - a.d)} />
        </Section>
      </div>
    </div>
  );
}
