'use client';

import { useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Section, Stats, Stat, Bars, Ring, Data, Empty, Col, Note, Trend } from '@/components/ui';
import { Segmented } from '@/components/Switch';
import { useAsync, type Async } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { BUILDING, TASK_SHEET, LAYER_BY_ID, bagtsKey, buildingKey, isConstructionNo } from '@/lib/services';
import {
  loadBlockProgress, loadBlockHistory, loadBlockUniverse, progressSeries, pkgProgressOf, universeKeys,
  latestMean, mapKeyIssues, loadInfraProgress, type BlockHistory,
} from '@/lib/blockProgress';
import { loadSheetRows, sheetBagtsNames, type SheetRow, type SheetRowOpts } from '@/modules/sheet/sheetRows';
import { register } from '@/lib/dataBus';
import { num, pct, text } from '@/lib/format';

const HUE = LAYER_BY_ID['mon:building'].hue;
const F = BUILDING.fields;


/** null/хоосон утгыг НЭГ бүлэгт (ArcGIS null ба ' '-г тусад нь буцаадаг) */
const UNKNOWN = () => tr('Тодорхойгүй');

/* ─────────────── Бөглөх хуудасны мөрийн кэш ─────────────── */

/**
 * Тиймээс дуудлагын түлхүүрээр кэшлэнэ — `blockProgress.ts`-ийн
 * `memo(fn, ['BAGTS_SHEET'])` загвараар: бөглөх хуудсанд бичмэгц `dataBus`
 * кэшийг хаяж, тоо шууд шинэчлэгдэнэ.
 */
const MAX_SHEET_CACHE = 4;
const sheetCache = new Map<string, Promise<SheetRow[]>>();
register(() => sheetCache.clear(), ['BAGTS_SHEET']);

function cachedSheetRows(opts: SheetRowOpts): Promise<SheetRow[]> {
  const key = JSON.stringify([opts.group ?? null, opts.block ?? null, !!opts.constructionOnly, opts.maxLevel ?? null]);
  const hit = sheetCache.get(key);
  if (hit) {
    // Хамгийн сүүлд хэрэглэсэн нь эцэст (LRU)
    sheetCache.delete(key);
    sheetCache.set(key, hit);
    return hit;
  }
  const p = loadSheetRows(opts).catch((e) => { sheetCache.delete(key); throw e; });
  sheetCache.set(key, p);
  while (sheetCache.size > MAX_SHEET_CACHE) {
    const oldest = sheetCache.keys().next().value;
    if (oldest === undefined) break;
    sheetCache.delete(oldest);
  }
  return p;
}

export type Block = {
  oid: number;
  /** `${БАГЦ}|блок` — нэгтгэсэн хүснэгттэй холбогдох түлхүүр */
  key: string;
  bagts: string;
  /** Блокийн нэр («5/1») — багц дотор л давтагдашгүй */
  blok: string;
  contractor: string;
  /** Өрхийн тоо — `AIL_TOO` хоосон бол 0 БОЛОВЧ `ailMissing = true` (нийлбэрт «дутуу» гэж тэмдэглэ) */
  ail: number;
  ailMissing?: boolean;
  floors: number | null;
  /** «Б.» мөрийн гүйцэтгэл 0–100; бөглөгдөөгүй бол null */
  progress: number | null;
  /** Б1…Б5 → % (бөглөгдөөгүй бол null) */
  phases: Map<string, number | null>;
};

type Agg = {
  key: string;
  /** Газрын зураг шүүх FID-ууд */
  oids: number[];
  /** Цуваа хязгаарлах блокийн түлхүүрүүд */
  keys: string[];
  blocks: number;
  ail: number;
};

/** Дундаж — бөглөгдөөгүй блокийг ОРУУЛАХГҮЙ (0 гэж тоовол дундаж худал буурна) */
const meanOf = (vals: (number | null)[]) => {
  const xs = vals.filter((v): v is number => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

/**
 * ТҮЛХҮҮР БҮРЭЭС НЭГ feature — тоолол/дунджид (2026-10-01, «хэрэглэгч: бүгдийг зас»).
 */
export function uniqueBlocks<B extends { key: string }>(bs: readonly B[]): B[] {
  const seen = new Set<string>();
  return bs.filter((b) => (seen.has(b.key) ? false : (seen.add(b.key), true)));
}

function aggregate(blocks: Block[], keyOf: (b: Block) => string): Agg[] {
  const m = new Map<string, Block[]>();
  for (const b of blocks) {
    const k = keyOf(b) || UNKNOWN();
    const a = m.get(k);
    if (a) a.push(b); else m.set(k, [b]);
  }
  return [...m].map(([key, bs]) => {
    const u = uniqueBlocks(bs);
    return {
      key,
      oids: bs.map((b) => b.oid),
      keys: u.map((b) => b.key),
      blocks: u.length,
      ail: u.reduce((s, b) => s + b.ail, 0),
    };
  });
}

/**
 * Барилгын блокуудын нэгдсэн гүйцэтгэл — нэгтгэсэн хүснэгтийн as-of утгаар.
 * `loadBlockProgress` нь cache-тэй тул газрын зургийн өнгө, tooltip, баруун самбартай
 * ЯГ нэг эх сурвалж. 2026-10-01: хэрэглэгддэггүй `BuildingSummary` (зүүн баганын
 * хуучин самбар) УСТГАВ — git түүхэнд бий.
 */

/**
 * ГАЗРЫН ЗУРГИЙН ТҮЛХҮҮРИЙН ЗӨРҮҮ → console (ЗӨВХӨН хөгжүүлэлтийн горим, сешнд нэг удаа).
 */
let mapKeysWarned = false;
function warnMapKeys(featureKeys: string[], measured: Iterable<string>): void {
  if (mapKeysWarned) return;
  mapKeysWarned = true;
  const { dup, orphan, relabel } = mapKeyIssues(featureKeys, measured);
  if (!dup.length && !orphan.length) return;
  console.warn(
    '[selbe] Барилгын блокийн давхарга (SELBE_ALL_DATA_last_0917/112, BAGTS · BLOK) — админ засна:'
    + (dup.length ? `\n  · давхардсан полигон (${dup.length}): ${dup.join(', ')}` : '')
    + (orphan.length ? `\n  · хэмжилттэй атлаа полигонгүй (${orphan.length}): ${orphan.join(', ')}` : '')
    + (relabel.length ? `\n  · багцын нэр буруу байж болзошгүй: ${relabel.map((x) => `${x.feature} → ${x.measured}?`).join(', ')}` : ''),
  );
}

export function useBuildings() {
  return useAsync(loadBuildings, []);
}

export async function loadBuildings() {
  {
    const [rows, prog, hist, uni, infraPct] = await Promise.all([
      queryFeatures(BUILDING.url, {
        outFields: [BUILDING.oid, F.bagts, F.block, F.contractor, F.floors, F.households],
        limit: 2000,
      }),
      loadBlockProgress(),
      loadBlockHistory(),
      loadBlockUniverse(),
      loadInfraProgress(),
    ]);

    /** Б1…Б5-ын нэр — хүснэгтээс ирнэ (гар аргаар бичихгүй) */
    const phaseName = new Map<string, string>();
    let asOf = '';

    const blocks: Block[] = rows.map((r) => {
      const key = buildingKey(r[F.bagts], r[F.block]);
      const cell = prog.get(key);
      const phases = new Map<string, number | null>();
      for (const p of cell?.phases ?? []) {
        phases.set(p.no, p.pct);
        if (p.name && !phaseName.has(p.no)) phaseName.set(p.no, p.name);
      }
      if (cell && cell.date > asOf) asOf = cell.date;
      const dav = Number(r[F.floors]);
      return {
        oid: Number(r[BUILDING.oid]),
        key,
        bagts: text(r[F.bagts], '').trim(),
        blok: text(r[F.block], '').trim(),
        ...((): { ail: number; ailMissing: boolean } => {
          const raw = r[F.households];
          const v = raw == null || raw === '' ? NaN : Number(raw);
          return Number.isFinite(v) ? { ail: v, ailMissing: false } : { ail: 0, ailMissing: true };
        })(),
        contractor: text(r[F.contractor], '').trim(),
        floors: Number.isFinite(dav) && dav > 0 ? dav : null,
        progress: cell?.overall ?? null,
        phases,
      };
    });

    const uniq = uniqueBlocks(blocks);
    const withData = uniq.filter((b) => b.progress != null);
    if (process.env.NODE_ENV !== 'production') warnMapKeys(blocks.map((b) => b.key), prog.keys());
    const pkgPct = new Map<string, number>();
    for (const [k, v] of pkgProgressOf(prog, uni)) pkgPct.set(k, v.pct);
    for (const [k, v] of infraPct) if (!pkgPct.has(k)) pkgPct.set(k, v.pct);
    const allKeys = universeKeys(prog, uni);

    return {
      /** Блокийн ТҮҮХИЙ мөрүүд — «Багцын мэдээлэл» блок бүрээр задалж харуулна */
      rows: blocks,
      /**
       * `bagtsKey` → багцын гүйцэтгэл (0–100) — `buildPacks(rows, pkgPct)`-д дамжуулна.
       */
      pkgPct,
      blocks: uniq.length,
      households: uniq.reduce((s, b) => s + b.ail, 0),
      householdsMissing: uniq.filter((b) => b.ailMissing).length,
      progress: latestMean(prog, allKeys).pct,
      floors: meanOf(uniq.map((b) => b.floors)),
      /** Хүснэгтэд хараахан бөглөгдөөгүй блок */
      noData: uniq.length - withData.length,
      asOf,

      /** Цувааны эх — бүх блокийн «Б.» мөрийн түүх */
      hist,
      /** Бүх блокийн түлхүүр (цувааны анхдагч хамрах хүрээ) — 2026-10-01-ээс бөглөх хуудасны хуваарь */
      keys: allKeys,

      /**
       * Блок бүрийн хэмжилт — түвшний тоолол (`blockProgress.levelCounts(prog, keys)`).
       */
      prog,

      bagts: aggregate(blocks, (b) => b.bagts)
        .map((g) => {
          const bk = bagtsKey(g.key);
          return {
            ...g,
            keys: uni.has(bk) ? universeKeys(prog, uni, [bk]) : g.keys,
            progress: pkgPct.get(bk) ?? null,
          };
        })
        .sort((a, b) => a.key.localeCompare(b.key, 'mn')),

      contractors: aggregate(blocks, (b) => b.contractor).sort((a, b) => b.blocks - a.blocks),

      // Үе шат = «Б. Барилга угсралтын ажил»-ын ТАВАН дэд үе шат (Б1…Б5).
      // Эх excel өөрөө жингээр бодсон дүн тул энд дахин жигнэхгүй — дундажлана.
      stages: TASK_SHEET.subPhaseNos.map((no) => {
        const hit = uniq.filter((b) => b.phases.get(no) != null);
        const hitKeys = new Set(hit.map((b) => b.key));
        return {
          key: no,
          label: `${no} · ${phaseName.get(no) ?? ''}`.trim(),
          value: meanOf(hit.map((b) => b.phases.get(no)!)),
          blocks: hit.length,
          oids: blocks.filter((b) => hitKeys.has(b.key)).map((b) => b.oid),
          keys: hit.map((b) => b.key),
        };
      }).filter((st) => phaseName.has(st.key)),
    };
  }
}

/* ═════════════ Явцын муруй — өдөр / сараар ═════════════ */

/** Хэмжих алхам — бүртгэлийн огноогоор эсвэл сарын эцсийн байдлаар */
const GRAINS = [
  { key: 'month', get label() { return tr('Сараар'); } },
  { key: 'day', get label() { return tr('Огноогоор'); } },
];

/** Нэг барилгын явц — баруун самбарт, блок сонгосон үед */
function BlockTrend({ hist, blockKey }: { hist: BlockHistory; blockKey: string }) {
  const [grain, setGrain] = useState('month');
  const pts = progressSeries(hist, [blockKey], grain === 'day' ? 'day' : 'month');
  if (pts.length < 2) return null;

  return (
    <Section title={tr('Барилга угсралтын явц')} note={tr('{0} хэмжилт', pts.length)}>
      <Col gap="md">
        <Segmented value={grain} onChange={setGrain} label={tr('Цувааны алхам')}
          options={GRAINS.map((g) => ({ value: g.key, label: g.label }))} />
        <Trend
          color={HUE}
          points={pts.map((p) => ({
            label: p.label,
            value: p.overall,
            note: p.label === p.date ? undefined : p.date,
          }))}
        />
      </Col>
    </Section>
  );
}

/* ═════════════ БАГЦЫН дашбоард — ажлын төрлөөр ═════════════ */

/**
 * Хуудсын багцын нэр нь давхаргынхаас ӨӨР бичигддэг («Багц 4.1» ↔ «Багц 4-1»)
 * тул давхаргын нэрийг шууд тааруулж болохгүй — `bagtsKey`-ээр жишнэ.
 */
const matchBagts = (layerBagts: string): string | null =>
  sheetBagtsNames().find((n) => bagtsKey(n) === bagtsKey(layerBagts)) ?? null;

type BagtsWork = {
  /** № (жишээ «3.2») — блок бүрд өөр байж болно, тиймээс түлхүүр нь НЭР */
  no: string;
  name: string;
  /** Багцын блокуудын дундаж, 0–100 (бүртгэлтэй блокоор) */
  pct: number | null;
  /** Тухайн ажлыг бүртгэсэн блокийн тоо */
  blocks: number;
};
type BagtsData = { name: string; asOf: string; blocks: number; works: BagtsWork[] };

/**
 * Сонгосон БАГЦЫН ажлын төрөл бүрийн гүйцэтгэл — excel-ийн «dashboard» хуудасны
 * хүснэгттэй ижил (Бэлтгэл ажил · Суурь ухлагын ажил · N-р давхрын цутгалт …).
 *
 * Мөр = ХАМГИЙН ГҮН толгой мөрүүд: түвшин 1–4-ийн мөр бөгөөд түүний дараах
 * толгой мөрийн түвшин нь ≤ өөрийнх (өөрөөр хэлбэл доор нь ЗӨВХӨН навч ажил).
 * Ингэснээр «3. ТӨМӨР БЕТОН РАМЫН АЖИЛ» (дэд толгойтой) хасагдаж, «3.2 · 1-р
 * давхар цутгалт» үлдэнэ.
 */
function useBagtsWorks(layerBagts: string | null): Async<BagtsData | null> {
  return useAsync(async () => {
    if (!layerBagts) return null;
    const name = matchBagts(layerBagts);
    if (!name) return null;

    // Түвшин 1–4 — навч ажлууд (түвшин 5) энэ хүснэгтэд ОРОХГҮЙ тул шүүлтийг
    // уншигч дээр өгнө: багц бүрд 20 блок × мянган навч татах шаардлагагүй.
    const rows = await cachedSheetRows({ group: name, maxLevel: 4 });
    if (!rows.length) return null;

    /** Нэг блокийн нэг агшны мөрүүд — гүн толгойг ЭНД тодорхойлно */
    const batches = new Map<string, SheetRow[]>();
    let asOf = '';
    const blocks = new Set<string>();
    for (const r of rows) {
      blocks.add(r.block);
      if (r.date > asOf) asOf = r.date;
      const k = `${r.sheet}#${r.snap}|${r.block}`;
      const arr = batches.get(k);
      if (arr) arr.push(r); else batches.set(k, [r]);
    }
    for (const arr of batches.values()) arr.sort((a, b) => a.ord - b.ord);

    /** ажлын нэр → блок → хамгийн их % */
    const byWork = new Map<string, { no: string; order: number; vals: Map<string, number> }>();
    /** Мөрийн дараалал нь ХАМГИЙН УРТ тайлангаас (өндөр блок бүх давхраа агуулна) */
    let orderOf = new Map<string, number>();
    for (const arr of batches.values()) {
      const seen: string[] = [];
      for (let i = 0; i < arr.length; i += 1) {
        const r = arr[i];
        const next = arr[i + 1];
        // Дэд толгойтой мөрийг алгасна — «3. ТӨМӨР БЕТОН РАМЫН АЖИЛ» хасагдаж
        // «3.2 · 1-р давхар цутгалт» үлдэнэ.
        if (next && Number(next.level) > Number(r.level)) continue;
        const work = r.work.trim();
        if (!work) continue;
        seen.push(work);
        const e = byWork.get(work) ?? { no: r.no, order: 0, vals: new Map() };
        const p = r.progress == null ? null : r.progress * 100;
        if (p != null) {
          const prev = e.vals.get(r.block);
          e.vals.set(r.block, prev == null ? p : Math.max(prev, p));
        }
        byWork.set(work, e);
      }
      if (seen.length > orderOf.size) orderOf = new Map(seen.map((w, i) => [w, i]));
    }

    const works: BagtsWork[] = [...byWork]
      .map(([name_, e]) => ({
        no: e.no,
        name: name_,
        pct: meanOf([...e.vals.values()]),
        blocks: e.vals.size,
        order: orderOf.get(name_) ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.order - b.order)
      .map(({ no, name: n, pct: p, blocks: bl }) => ({ no, name: n, pct: p, blocks: bl }));

    return { name, asOf, blocks: blocks.size, works };
  }, [layerBagts]);
}

/**
 * БАРУУН самбар — багц сонгосон үед (барилга сонгоогүй): ажлын төрөл бүрийн
 * гүйцэтгэл. Зүүн баганын «Багц тус бүрээр» мөрөнд дарахад энэ гарна.
 */
export function MonitorBagts({ bagts }: { bagts: string }) {
  const q = useBagtsWorks(bagts);
  return (
    <Data q={q} loading={tr('Багцын ажлын гүйцэтгэл татаж байна…')}>
      {(d) => {
        if (!d) return <Section title={bagts}><Empty label={tr('«{0}»-ийн ажлын гүйцэтгэл хүснэгтэд бүртгэгдээгүй байна.', bagts)} /></Section>;
        const done = d.works.filter((w) => w.pct != null);
        return (
          <>
            <Section tone="primary" title={tr('{0} — ажлын гүйцэтгэл', d.name)} note={d.asOf}>
              <Col gap="sm">
                <Stats cols={2}>
                  <Stat value={num(d.blocks)} unit={tr('блок')} label={tr('Блок')} color={HUE} accent />
                  <Stat value={num(done.length)} unit={tr('төрөл')} label={tr('Ажлын төрөл')} color={HUE} accent />
                </Stats>
                <Note>
                  {tr('Ажлын төрөл тус бүрийн гүйцэтгэл — багцын блокуудын дундаж (бүртгэсэн блокоор). Блок бүрд бүх тайлангийн хамгийн их утга.')}
                </Note>
              </Col>
            </Section>

            <Section title={tr('Ажлын төрлөөр')} note={tr('{0} мөр', num(d.works.length))}>
              <Bars
                color={HUE}
                max={100}
                items={d.works.map((w) => ({
                  key: `${w.no}|${w.name}`,
                  label: w.name,
                  value: w.pct ?? null,
                  display: w.pct == null ? tr('мэдээлэлгүй') : tr('{0} · {1} блок', pct(w.pct, 1), num(w.blocks)),
                }))}
              />
            </Section>
          </>
        );
      }}
    </Data>
  );
}

/* ═════════════ Блокийн АЖЛЫН ГҮЙЦЭТГЭЛ — нэгтгэсэн хүснэгтээс ═════════════ */

type HeaderWork = { name: string; progress: number | null };
export type TaskPerfData = {
  version: string;             // «2026-07-20» — сүүлийн бөглөсөн огноо
  overall: number | null;      // «Б. Барилга угсралтын ажил» мөрийн гүйцэтгэл (0–100)
  headers: HeaderWork[];       // Б1…Б5 дэд үе шатууд
  /** Нийт навч ажил — мэдээлэлгүй (null) нүд ОРНО (`noData`-г үзнэ үү) */
  taskCount: number;
  done: number;                // дууссан (гүйц ≥ 1)
  inProgress: number;          // явцтай (0 < гүйц < 1)
  notStarted: number;          // эхлээгүй — ЯГ 0 бичигдсэн (null ОРОХГҮЙ)
  noData: number;
  /** Энэ блокийн «Б.» мөрийн түүх — явцын муруйд */
  hist: BlockHistory;
  key: string;
};

/**
 * Мөрийн онц — ажлын нэр давхрын хэсэг тус бүрд ДАВТАГДАНА («1-р давхрын
 * цутгалт» барилга бүрд 11 хүртэл удаа), тиймээс ХЭСГИЙН нэр түлхүүрт ЗААВАЛ
 * орно. Эс бөгөөс өөр давхрын мөрүүд чимээгүй нийлж, ажлын тоо буурна.
 */
const rowKey = (r: SectionRow) => `${r.section}|${r.level ?? ''}|${r.work}`;

/** `SheetRow` + тухайн мөрийн ХАРЬЯА ХЭСЭГ (дээрх хамгийн ойрын толгой мөр) */
type SectionRow = SheetRow & { section: string };

/**
 * ХЭСГИЙН НЭРИЙГ СТАМПАЛНА — навч мөрийн хэсэг нь хуудасны дараалал дахь
 * дээрх хамгийн ойрын ТОЛГОЙ мөр (түвшин ≠ 5).
 */
function stampSections(rows: SheetRow[]): SectionRow[] {
  const batches = new Map<string, SheetRow[]>();
  for (const r of rows) {
    const k = `${r.sheet}#${r.snap}|${r.block}`;
    const arr = batches.get(k);
    if (arr) arr.push(r); else batches.set(k, [r]);
  }
  const out: SectionRow[] = [];
  for (const arr of batches.values()) {
    arr.sort((a, b) => a.ord - b.ord);
    let sec = '';
    for (const r of arr) {
      if (r.level !== 5) { sec = r.work; out.push({ ...r, section: sec }); }
      else out.push({ ...r, section: sec });
    }
  }
  return out;
}

/**
 * Тухайн блокийн ажлын гүйцэтгэл — БҮГД «Гүйцэтгэл бөглөх»-ийн нэгтгэсэн
 * хүснэгтээс.
 *
 *   нийт %       «Б.» мөрийн тухайн барилгын нүд (`loadBlockProgress` — газрын
 *                зургийн өнгөтэй ЯГ нэг эх сурвалж, Бэлтгэл ажил ОРОХГҮЙ)
 *   үе шат       «Б1»…«Б5» мөрүүд
 *   ажлын төлөв  «Б.»-ийн доорх навч мөрүүд (Түвшин 5), as-of сүүлийн утгаар
 */
export function useTaskPerf(b: PickedBuilding | null): Async<TaskPerfData | null> {
  const blok = b?.blok ?? null;
  const bagts = b?.bagts ?? null;
  return useAsync(async () => {
    if (!blok) return null;
    const [raw, prog, hist] = await Promise.all([
      // Зөвхөн ЭНЭ блокийн багана татагдана — уншигч нь `block`-оор outFields-ээ
      // нарийсгадаг тул хүсэлт багц бүхэлдээ татахаас хамаагүй хөнгөн.
      bagts ? cachedSheetRows({ group: bagts, block: blok }) : Promise.resolve([]),
      loadBlockProgress(),
      loadBlockHistory(),
    ]);
    const key = buildingKey(bagts, blok);
    const cell = prog?.get(key) ?? null;
    if (!raw.length) return cell ? { ...emptyPerf(cell), hist, key } : null;

    // Давхрын хэсгийг мөрийн дараалллаас стампална (хуудсанд `angilal_b` алга)
    const mine = stampSections(raw);

    // Үе шат (А. Бэлтгэл / Б. Барилга угсралт) — агшин бүрд түвшин-1 мөрөөс
    // доош тархана. Ажлын төлөв ЗӨВХӨН Б.-ийн навчаар тоологдоно: нийт
    // гүйцэтгэл нь мөн Б. үе шатынх (Бэлтгэл ажил ороогүй).
    const phase = new Map<string, string>();
    const batches = new Map<string, SectionRow[]>();
    for (const r of mine) {
      const k = `${r.sheet}#${r.snap}|${r.block}`;
      const arr = batches.get(k);
      if (arr) arr.push(r); else batches.set(k, [r]);
    }
    for (const arr of batches.values()) {
      arr.sort((a, b) => a.ord - b.ord);
      let cur = '';
      for (const r of arr) {
        if (r.level === 1) cur = r.no;
        phase.set(rowKey(r), cur);
      }
    }

    // As-of: нүд бүрээр СҮҮЛИЙН утга — огноо ӨСӨХ, дотор нь мөрийн дараалал
    const byDate = [...mine].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ord - b.ord));
    const win = new Map<string, SectionRow>();
    let maxDate = '';
    for (const r of byDate) {
      win.set(rowKey(r), r);
      if (r.date > maxDate) maxDate = r.date;
    }

    let done = 0, inProgress = 0, notStarted = 0, noData = 0;
    for (const [k, r] of win) {
      if (r.level !== 5) continue;
      if (!isConstructionNo(phase.get(k))) continue;
      const p = r.progress;
      if (p == null) noData += 1;
      else if (p >= 1) done += 1; else if (p > 0) inProgress += 1; else notStarted += 1;
    }
    const taskCount = done + inProgress + notStarted + noData;
    if (!taskCount && !cell) return null;

    return {
      version: cell?.date || maxDate,
      overall: cell?.overall ?? null,
      headers: phasesOf(cell),
      taskCount, done, inProgress, notStarted, noData,
      hist, key,
    };
  }, [bagts, blok]);
}

type Cell = NonNullable<ReturnType<NonNullable<Awaited<ReturnType<typeof loadBlockProgress>>>['get']>>;

const phasesOf = (cell: Cell | null): HeaderWork[] =>
  (cell?.phases ?? []).map((p) => ({ name: p.name.replace(/\s+/g, ' ').trim(), progress: p.pct }));

/** Нийт % бөглөгдсөн ч навч мөр нь ирээгүй блок (өөр багцын нэрийн зөрүү г.м) */
const emptyPerf = (cell: Cell): Omit<TaskPerfData, 'hist' | 'key'> => ({
  version: cell.date,
  overall: cell.overall,
  headers: phasesOf(cell),
  taskCount: 0, done: 0, inProgress: 0, notStarted: 0, noData: 0,
});

/** Сонгосон барилга — БАГЦ + БЛОК хосоор (блокийн нэр багц дотор л давтагдахгүй) */
export type PickedBuilding = { bagts: string; blok: string };
export function pickedBuilding(
  picked: Record<string, unknown> | null,
  pickedLayer: string | null,
): PickedBuilding | null {
  if (picked == null || pickedLayer !== 'mon:building') return null;
  const blok = text(picked[F.block], '').trim();
  return blok ? { bagts: text(picked[F.bagts], '').trim(), blok } : null;
}

/**
 * ЗҮҮН — барилгын ЕРӨНХИЙ гүйцэтгэл: нийт % + ажлын төлөв.
 */
export function MonitorGeneral({ b, q }: { b: PickedBuilding | null; q: Async<TaskPerfData | null> }) {
  if (!b) {
    return <Section><Empty label={tr('Барилга сонгоогүй байна.')} hint={tr('Газрын зураг дээрх барилга дээр дарж сонгоно уу.')} /></Section>;
  }
  return (
    <Data q={q} loading={tr('Ажлын гүйцэтгэл татаж байна…')}>
      {(d) => {
        if (!d) return <Section title={tr('Ажлын гүйцэтгэл')}><Empty label={tr('«{0}» блокийн ажлын гүйцэтгэл хараахан бүртгэгдээгүй байна.', b.blok)} /></Section>;
        return (
          <>
            <Section tone="primary" title={tr('{0} — нийт гүйцэтгэл', b.blok)} note={d.version}>
              <Col gap="sm">
                <Ring value={d.overall} color={HUE} size="md" label={tr('угсралт')} />
                <Note>
                  {d.overall == null
                    ? tr('Барилга угсралтын ажлын гүйцэтгэл хараахан бөглөгдөөгүй.')
                    : tr('«Б. Барилга угсралтын ажил» үе шатын гүйцэтгэл (Бэлтгэл ажил ороогүй). Задаргаа «{0}» ажлаар.', num(d.taskCount))}
                </Note>
              </Col>
            </Section>

            <Section title={tr('Ажлын төлөв')} note={tr('{0} ажил', num(d.taskCount))}>
              <Stats cols={4}>
                <Stat value={num(d.done)} unit={tr('ажил')} label={tr('Дууссан')} color="var(--good)" />
                <Stat value={num(d.inProgress)} unit={tr('ажил')} label={tr('Явцтай')} color={HUE} accent />
                <Stat value={num(d.notStarted)} unit={tr('ажил')} label={tr('Эхлээгүй')} color="var(--ink-3)" />
                <Stat value={num(d.noData)} unit={tr('ажил')} label={tr('Мэдээлэлгүй')} color="var(--ink-3)" />
              </Stats>
            </Section>
          </>
        );
      }}
    </Data>
  );
}

/**
 * БАРУУН — ажлын ДЭЛГЭРЭНГҮЙ гүйцэтгэл: Б1…Б5 дэд үе шат.
 */
export function MonitorDetail({ b, q }: { b: PickedBuilding | null; q: Async<TaskPerfData | null> }) {
  if (!b) {
    return <Section><Empty label={tr('Барилга сонгоогүй байна.')} hint={tr('Газрын зураг дээрх барилга дээр дарж сонгоно уу.')} /></Section>;
  }
  return (
    <Data q={q} loading={tr('Ажлын гүйцэтгэл татаж байна…')}>
      {(d) => {
        if (!d) return <Section title={tr('Гүйцэтгэл үе шатаар')}><Empty label={tr('Мэдээлэл алга.')} hint={tr('Энэ барилгын ажлын гүйцэтгэл «Гүйцэтгэл бөглөх» хуудсанд хараахан бүртгэгдээгүй байна.')} /></Section>;
        return (
          <>
            {/* Энэ блокийн «Б.» мөрийн бүртгэл бүхэн — хэзээ хурдалсныг харуулна */}
            <BlockTrend hist={d.hist} blockKey={d.key} />

            {d.headers.length > 0 && (
              <Section title={tr('Барилга угсралтын ажил')} note={tr('{0} үе шат · {1}', d.headers.length, d.version)}>
                <Bars
                  color={HUE}
                  max={100}
                  items={d.headers.map((h, i) => ({
                    key: `${i}:${h.name}`,
                    label: h.name,
                    value: h.progress ?? null,
                    display: h.progress == null ? tr('мэдээлэлгүй') : pct(h.progress, 0),
                  }))}
                />
              </Section>
            )}
          </>
        );
      }}
    </Data>
  );
}
