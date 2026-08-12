'use client';

import { useState } from 'react';
import { Section, Stats, Stat, Bars, Stack, Ring, Data, Empty, Col, Note, Split, Tabs, Trend, Select } from '@/components/ui';
import { useFilter } from '@/lib/filter';
import { useAsync, type Async } from '@/lib/useAsync';
import { queryFeatures } from '@/lib/query';
import { BUILDING, PROGRESS_LEVELS, TASK_SHEET, LAYER_BY_ID, bagtsKey, buildingKey } from '@/lib/services';
import { loadBlockProgress, loadBlockHistory, progressSeries, type BlockHistory } from '@/lib/blockProgress';
import { ACTUAL, applySections, qesc, queryAll, type Feature } from '@/modules/sheet/ags';
import { num, pct, text, shade } from '@/lib/format';

const HUE = LAYER_BY_ID['mon:building'].hue;
/** Гүйцэтгэлийн түвшний нэг өнгө — сүүлийн (Дууссан) хамгийн тод → эхнийх бүдэг */
const lvlHue = (i: number, n: number) => shade(HUE, n - 1 - i, n);
const F = BUILDING.fields;
const TS = TASK_SHEET.fields;

/**
 * ⚠️ ГҮЙЦЭТГЭЛИЙН БҮХ ТОО «Гүйцэтгэл бөглөх»-ийн нэгтгэсэн хүснэгтээс
 * (`Selbe_guitsetgel_consolidated`) — shapefile-ийн `GUITS_HV` ба 16 үе шатын
 * талбар ХУУЧИРСАН тул энэ хуудсанд ОГТ хэрэглэхгүй. Барилгын давхаргаас зөвхөн
 * гүйцэтгэлгүй шинж чанар (айл, давхар, гүйцэтгэгч, FID) авна — тэдгээр нь
 * хүснэгтэд байхгүй.
 */

/** null/хоосон утгыг НЭГ бүлэгт (ArcGIS null ба ' '-г тусад нь буцаадаг) */
const UNKNOWN = 'Тодорхойгүй';

export type Block = {
  oid: number;
  /** `${БАГЦ}|блок` — нэгтгэсэн хүснэгттэй холбогдох түлхүүр */
  key: string;
  bagts: string;
  /** Блокийн нэр («5/1») — багц дотор л давтагдашгүй */
  blok: string;
  contractor: string;
  ail: number;
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
  progress: number | null;
};

/** Дундаж — бөглөгдөөгүй блокийг ОРУУЛАХГҮЙ (0 гэж тоовол дундаж худал буурна) */
const meanOf = (vals: (number | null)[]) => {
  const xs = vals.filter((v): v is number => v != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

function aggregate(blocks: Block[], keyOf: (b: Block) => string): Agg[] {
  const m = new Map<string, Block[]>();
  for (const b of blocks) {
    const k = keyOf(b) || UNKNOWN;
    const a = m.get(k);
    if (a) a.push(b); else m.set(k, [b]);
  }
  return [...m].map(([key, bs]) => ({
    key,
    oids: bs.map((b) => b.oid),
    keys: bs.map((b) => b.key),
    blocks: bs.length,
    ail: bs.reduce((s, b) => s + b.ail, 0),
    progress: meanOf(bs.map((b) => b.progress)),
  }));
}

/** FID жагсаалтаар шүүх — гүйцэтгэл нь давхаргын талбарт БАЙХГҮЙ тул SQL-ээр
 *  шууд харьцуулах боломжгүй; блокуудыг нэрлэн заана (113 блок — урт биш). */
const oidWhere = (oids: number[]) =>
  oids.length ? `${BUILDING.oid} IN (${oids.join(',')})` : '1=0';

/**
 * Барилгын блокуудын нэгдсэн гүйцэтгэл — нэгтгэсэн хүснэгтийн as-of утгаар.
 * `BuildingSummary` нэг л удаа дуудна; `loadBlockProgress` нь cache-тэй тул
 * газрын зургийн өнгө, tooltip, баруун самбартай ЯГ нэг эх сурвалж.
 */
export function useBuildings() {
  return useAsync(async () => {
    const [rows, prog, hist] = await Promise.all([
      queryFeatures(BUILDING.url, {
        outFields: [BUILDING.oid, F.bagts, F.block, F.contractor, F.floors, F.households],
        limit: 2000,
      }),
      loadBlockProgress(),
      loadBlockHistory(),
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
        contractor: text(r[F.contractor], '').trim(),
        ail: Number(r[F.households] ?? 0) || 0,
        floors: Number.isFinite(dav) && dav > 0 ? dav : null,
        progress: cell?.overall ?? null,
        phases,
      };
    });

    const withData = blocks.filter((b) => b.progress != null);

    return {
      /** Блокийн ТҮҮХИЙ мөрүүд — «Багцын мэдээлэл» блок бүрээр задалж харуулна */
      rows: blocks,
      blocks: blocks.length,
      households: blocks.reduce((s, b) => s + b.ail, 0),
      progress: meanOf(blocks.map((b) => b.progress)),
      floors: meanOf(blocks.map((b) => b.floors)),
      /** Хүснэгтэд хараахан бөглөгдөөгүй блок */
      noData: blocks.length - withData.length,
      asOf,

      /** Цувааны эх — бүх блокийн «Б.» мөрийн түүх */
      hist,
      /** Бүх блокийн түлхүүр (цувааны анхдагч хамрах хүрээ) */
      keys: blocks.map((b) => b.key),

      levels: PROGRESS_LEVELS.map((l) => {
        const hit = withData.filter((b) => b.progress! >= l.min && b.progress! < l.max);
        return { ...l, value: hit.length, oids: hit.map((b) => b.oid), keys: hit.map((b) => b.key) };
      }),

      bagts: aggregate(blocks, (b) => b.bagts).sort((a, b) => a.key.localeCompare(b.key, 'mn')),

      contractors: aggregate(blocks, (b) => b.contractor).sort((a, b) => b.blocks - a.blocks),

      // Үе шат = «Б. Барилга угсралтын ажил»-ын ТАВАН дэд үе шат (Б1…Б5).
      // Эх excel өөрөө жингээр бодсон дүн тул энд дахин жигнэхгүй — дундажлана.
      stages: TASK_SHEET.subPhaseNos.map((no) => {
        const hit = blocks.filter((b) => b.phases.get(no) != null);
        return {
          key: no,
          label: `${no} · ${phaseName.get(no) ?? ''}`.trim(),
          value: meanOf(hit.map((b) => b.phases.get(no)!)),
          blocks: hit.length,
          oids: hit.map((b) => b.oid),
          keys: hit.map((b) => b.key),
        };
      }).filter((st) => phaseName.has(st.key)),
    };
  }, []);
}

/* ═════════════ Явцын муруй — өдөр / сараар ═════════════ */

/** Хэмжих алхам — бүртгэлийн огноогоор эсвэл сарын эцсийн байдлаар */
const GRAINS = [
  { key: 'month', label: 'Сараар' },
  { key: 'day', label: 'Огноогоор' },
];

/**
 * «Б. БАРИЛГА УГСРАЛТЫН АЖИЛ»-ын гүйцэтгэл цаг хугацаагаар.
 *
 * ⚠️ Хүснэгтэд ӨДӨР ТУТМЫН бичлэг БАЙХГҮЙ — тайлан ирэх бүрд (одоогоор ~9 удаа)
 * л мөр нэмэгддэг. Тиймээс «огноогоор» гэдэг нь БҮРТГЭЛИЙН огноонууд, «сараар»
 * нь сар бүрийн эцсийн байдал (бүртгэлгүй сар өмнөх утгаа хадгална). Хиймэл
 * өдөр үүсгэж муруйг «жигдрүүлэх» нь байхгүй хэмжилтийг байгаа мэт харуулна.
 */
function ProgressTrend({
  hist, all, bagts,
}: {
  hist: BlockHistory;
  /** Бүх блокийн түлхүүр — «Нийт төсөл» */
  all: string[];
  bagts: Agg[];
}) {
  const [grain, setGrain] = useState('month');
  const { active, toggle, clear } = useFilter();

  /**
   * ⚠️ Хамрах хүрээ нь ТУСДАА төлөв БИШ, ШҮҮЛТЭЭС уншигдана: зүүн баганын «Багц
   * тус бүрээр» мөрөнд дарахад газрын зураг, баруун самбар, энэ муруй ГУРВУУЛАА
   * тэр багц дээр шилжинэ. Хоёр төлөв байлгавал зураг «Багц 2», муруй «Багц 1»
   * гэж зөрж, аль нь ялсныг хэрэглэгч мэдэхгүй.
   */
  const scope = active?.key.startsWith(BAGTS_FILTER) ? active.key.slice(BAGTS_FILTER.length) : '*';
  const pickScope = (k: string) => {
    if (k === '*') return clear();
    const g = bagts.find((b) => b.key === k);
    if (g) {
      toggle({
        key: `${BAGTS_FILTER}${k}`, label: k, group: 'Багц',
        where: oidWhere(g.oids), view: 'monitor', layerIds: 'mon:building', color: HUE,
      });
    }
  };

  const keys = bagts.find((b) => b.key === scope)?.keys ?? all;
  const pts = progressSeries(hist, keys, grain === 'day' ? 'day' : 'month');

  return (
    <Section
      title="Барилга угсралтын явц"
      note={<Select
        label="Хамрах хүрээ"
        value={scope}
        onChange={pickScope}
        options={[{ key: '*', label: 'Нийт төсөл' }, ...bagts.map((b) => ({ key: b.key, label: b.key }))]}
      />}
    >
      {/* ⚠️ Алхмын товч нь диаграмын ХАЖУУД (дээр БИШ), тайлбар бичвэр
          хасагдсан — зурвас нь газрын зургийн доор тул өндөр нь хамгийн хортой. */}
      <Split asideEnd aside={<Tabs plain value={grain} onChange={setGrain} items={GRAINS} />}>
        <Trend
          color={HUE}
          points={pts.map((p) => ({
            label: p.label,
            value: p.overall,
            // Сарын шошго нь бодит хэмжилтийн огноог нуудаг — уншилтын мөрөнд буцааж гаргана
            note: p.label === p.date ? undefined : p.date,
          }))}
        />
      </Split>
    </Section>
  );
}

/** Нэг барилгын явц — баруун самбарт, блок сонгосон үед */
function BlockTrend({ hist, blockKey }: { hist: BlockHistory; blockKey: string }) {
  const [grain, setGrain] = useState('month');
  const pts = progressSeries(hist, [blockKey], grain === 'day' ? 'day' : 'month');
  if (pts.length < 2) return null;

  return (
    <Section title="Барилга угсралтын явц" note={`${pts.length} хэмжилт`}>
      <Col gap="md">
        <Tabs value={grain} onChange={setGrain} items={GRAINS} />
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

/* ═════════════ ЗҮҮН багана — бүх блокийн нэгдсэн үзүүлэлт ═════════════ */

/** Барилгын нэгдсэн өгөгдөл — `useBuildings()`-ын үр дүн (Portal нэг л удаа татна) */
type Buildings = ReturnType<typeof useBuildings>;

/**
 * Явцын муруй — ГАЗРЫН ЗУРГИЙН ДООР (зүүн баганад БИШ).
 * ⚠️ Өгөгдлийг Portal-аас дамжуулна: зүүн багана ба муруй хоёр НЭГ хүсэлтийн
 * багцаар ажиллана, хоёр удаа 113 блокоо татахгүй.
 */
export function MonitorTrend({ q }: { q: Buildings }) {
  return (
    <Data q={q}>
      {(d) => <ProgressTrend hist={d.hist} all={d.keys} bagts={d.bagts} />}
    </Data>
  );
}

/** Багцын шүүлтийн түлхүүрийн угтвар — самбар нь ямар багц сонгогдсоныг эндээс уншина */
export const BAGTS_FILTER = 'building:bagts:';

export function BuildingSummary({ q }: { q: Buildings }) {
  const { toggle, active } = useFilter();

  /** Идэвхтэй шүүлтийн түлхүүрээс тухайн жагсаалтын сонголтыг сэргээнэ */
  const selected = (prefix: string) =>
    active?.key.startsWith(prefix) ? active.key.slice(prefix.length) : null;

  /**
   * Газрын зураг дээр блокуудыг тодруулна.
   * ⚠️ Гүйцэтгэлийн талбар ЗӨВХӨН хяналтын блокийн давхаргад — бусад давхаргад
   * тавибал ArcGIS хүсэлт унана.
   */
  const pick = (key: string, label: string, group: string, oids: number[], color = HUE) =>
    toggle({ key, label, group, where: oidWhere(oids), view: 'monitor', layerIds: 'mon:building', color });

  return (
    <Data q={q}>
      {(d) => (
        <>
          <Section tone="primary">
            <Col gap="md">
              <Stats cols={2}>
                <Stat value={num(d.blocks)} unit="блок" label="Барилгын блок" color={HUE} accent />
                <Stat value={num(d.households)} unit="айл" label="Айлын тоо" color={HUE} accent />
              </Stats>
              <Split aside={<Ring value={d.progress} color={HUE} size={78} width={8} />}>
                <Note>
                  {num(d.blocks - d.noData)} блокийн «Барилга угсралтын ажил»-ын амьд дундаж{' '}
                  {pct(d.progress, 1)}{d.asOf ? ` (${d.asOf})` : ''}. Дундаж {num(d.floors, 1)} давхар.
                  {d.noData > 0 ? ` ${num(d.noData)} блок хараахан бөглөгдөөгүй.` : ''}
                </Note>
              </Split>
            </Col>
          </Section>

          <Section title="Гүйцэтгэлийн ангилал" note="дарж шүүнэ">
            <Col gap="md">
              {/* НЭГ ӨНГӨ (тодоос бүдгэр) — түвшин нь дараалалтай (Эхэлсэн→Дууссан)
                  тул гүйцэтгэл өндөр нь ТОД, бага нь бүдэг болж уусна. */}
              <Stack
                legend={false}
                total={d.blocks}
                items={d.levels.map((l, i) => ({ key: l.key, label: l.label, value: l.value, color: lvlHue(i, d.levels.length) }))}
              />
              <Bars
                max={Math.max(1, ...d.levels.map((l) => l.value))}
                selected={selected('building:level:')}
                onSelect={(k) => {
                  const i = d.levels.findIndex((x) => x.key === k);
                  const l = d.levels[i];
                  pick(`building:level:${k}`, `${l.label} · ${l.range}`, 'Гүйцэтгэлийн ангилал', l.oids, lvlHue(i, d.levels.length));
                }}
                items={d.levels.map((l, i) => ({
                  key: l.key,
                  label: `${l.label} · ${l.range}`,
                  value: l.value,
                  display: `${num(l.value)} блок`,
                  color: lvlHue(i, d.levels.length),
                }))}
              />
            </Col>
          </Section>

          <Section title="Багц тус бүрээр" note="дарж шүүнэ">
            <Bars
              color={HUE}
              max={100}
              selected={selected(BAGTS_FILTER)}
              onSelect={(k) => {
                const g = d.bagts.find((x) => x.key === k)!;
                pick(`${BAGTS_FILTER}${k}`, k, 'Багц', g.oids);
              }}
              items={d.bagts.map((b) => {
                const p = b.progress;
                return {
                  key: b.key,
                  label: `${b.key} · ${num(b.blocks)} блок`,
                  value: p ?? 0,
                  // null = гүйцэтгэл бүртгэгдээгүй. «0.0%» гэж бичвэл жинхэнэ 0%-аас ялгагдахгүй.
                  display: p == null ? 'мэдээлэлгүй' : pct(p),
                };
              })}
            />
          </Section>

          <Section title="Барилга угсралтын ажил" note="дарж шүүнэ">
            <Bars
              color={HUE}
              max={100}
              selected={selected('building:stage:')}
              onSelect={(k) => {
                const st = d.stages.find((x) => x.key === k)!;
                pick(`building:stage:${k}`, st.label, 'Ажлын үе шат', st.oids);
              }}
              items={d.stages.map((st) => ({
                key: st.key,
                label: st.label,
                value: st.value ?? 0,
                display: st.value == null ? 'бөглөгдөөгүй' : `${pct(st.value)} · ${num(st.blocks)} блок`,
              }))}
            />
          </Section>

          <Section title="Гүйцэтгэгч компани" note="дарж шүүнэ">
            <Bars
              color={HUE}
              max={100}
              limit={8}
              selected={selected('building:comp:')}
              onSelect={(k) => {
                const c = d.contractors.find((x) => x.key === k)!;
                pick(`building:comp:${k}`, k, 'Гүйцэтгэгч компани', c.oids);
              }}
              items={d.contractors.map((c) => {
                const p = c.progress;
                return {
                  key: c.key,
                  label: `${c.key} · ${num(c.blocks)} блок`,
                  value: p ?? 0,
                  display: p == null ? 'мэдээлэлгүй' : pct(p),
                };
              })}
            />
          </Section>
        </>
      )}
    </Data>
  );
}

/* ═════════════ БАГЦЫН дашбоард — ажлын төрлөөр ═════════════ */

/**
 * Хүснэгтийн багцын нэр нь давхаргынхаас ӨӨР бичигддэг («Багц 4.1» ↔ «Багц 4-1»)
 * тул SQL-д давхаргын нэрийг шууд тавьж болохгүй. Хүснэгтийн БОДИТ нэрсийг нэг
 * удаа татаад `bagtsKey`-ээр жишиж холбоно.
 */
let bagtsNames: Promise<string[]> | null = null;
const loadBagtsNames = () => (bagtsNames ??= queryAll(`${TS.bagts} IS NOT NULL`, {
  outFields: TS.bagts, returnDistinctValues: 'true', orderByFields: TS.bagts,
}).then((fs) => fs.map((f) => text(f.attributes[TS.bagts], '').trim()).filter(Boolean))
  .catch((e) => { bagtsNames = null; throw e; }));

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
 *
 * ⚠️ Түлхүүр нь № БИШ, АЖЛЫН НЭР: excel-ийн «3.10» ArcGIS-д «3.1» болж
 * хураагдсан тул 9 давхар блокийн «Техникийн давхар цутгалт» ба 12 давхар
 * блокийн «10-р давхар цутгалт» ХОЁУЛАА «3.11» дугаартай.
 *
 * ⚠️ Блок бүрийн утга нь бүх огнооны ХАМГИЙН ИХ нь (`progressSeries`-тэй ижил
 * дүрэм): угсралт буудаггүй, дутуу тайлан хиймэл бууралт үүсгэнэ.
 */
function useBagtsWorks(layerBagts: string | null): Async<BagtsData | null> {
  return useAsync(async () => {
    if (!layerBagts) return null;
    const names = await loadBagtsNames();
    const name = names.find((n) => bagtsKey(n) === bagtsKey(layerBagts));
    if (!name) return null;

    const feats = await queryAll(
      `${TS.bagts} = '${qesc(name)}' AND ${TS.level} <= 4 AND ${ACTUAL}`,
      {
        outFields: [TASK_SHEET.oid, TS.block, TS.date, TS.level, TS.no, TS.work, TS.progress].join(','),
        orderByFields: `${TS.date} ASC, ${TASK_SHEET.oid} ASC`,
      },
    );
    if (!feats.length) return null;

    /** Нэг блокийн нэг тайлангийн мөрүүд — гүн толгойг ЭНД тодорхойлно */
    const batches = new Map<string, Feature[]>();
    let asOf = '';
    const blocks = new Set<string>();
    for (const f of feats) {
      const a = f.attributes;
      const blok = text(a[TS.block], '').trim();
      const date = text(a[TS.date]);
      blocks.add(blok);
      if (date > asOf) asOf = date;
      const k = `${blok}|${date}`;
      const arr = batches.get(k);
      if (arr) arr.push(f); else batches.set(k, [f]);
    }

    /** ажлын нэр → блок → хамгийн их % */
    const byWork = new Map<string, { no: string; order: number; vals: Map<string, number> }>();
    /** Мөрийн дараалал нь ХАМГИЙН УРТ тайлангаас (өндөр блок бүх давхраа агуулна) */
    let orderOf = new Map<string, number>();
    for (const arr of batches.values()) {
      const seen: string[] = [];
      for (let i = 0; i < arr.length; i += 1) {
        const a = arr[i].attributes;
        const next = arr[i + 1]?.attributes;
        if (next && Number(next[TS.level]) > Number(a[TS.level])) continue; // дэд толгойтой
        const work = text(a[TS.work], '').trim();
        if (!work) continue;
        seen.push(work);
        const e = byWork.get(work) ?? { no: text(a[TS.no], '').trim(), order: 0, vals: new Map() };
        const p = a[TS.progress] == null ? null : Number(a[TS.progress]) * 100;
        if (p != null) {
          const blok = text(a[TS.block], '').trim();
          const prev = e.vals.get(blok);
          e.vals.set(blok, prev == null ? p : Math.max(prev, p));
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
    <Data q={q} loading="Багцын ажлын гүйцэтгэл татаж байна…">
      {(d) => {
        if (!d) return <Section title={bagts}><Empty label={`«${bagts}»-ийн ажлын гүйцэтгэл хүснэгтэд бүртгэгдээгүй байна.`} /></Section>;
        const done = d.works.filter((w) => w.pct != null);
        return (
          <>
            <Section tone="primary" title={`${d.name} — ажлын гүйцэтгэл`} note={d.asOf}>
              <Col gap="sm">
                <Stats cols={2}>
                  <Stat value={num(d.blocks)} unit="блок" label="Блок" color={HUE} accent />
                  <Stat value={num(done.length)} unit="төрөл" label="Ажлын төрөл" color={HUE} accent />
                </Stats>
                <Note>
                  Ажлын төрөл тус бүрийн гүйцэтгэл — багцын блокуудын дундаж
                  (бүртгэсэн блокоор). Блок бүрд бүх тайлангийн хамгийн их утга.
                </Note>
              </Col>
            </Section>

            <Section title="Ажлын төрлөөр" note={`${num(d.works.length)} мөр`}>
              <Bars
                color={HUE}
                max={100}
                items={d.works.map((w) => ({
                  key: `${w.no}|${w.name}`,
                  label: w.name,
                  value: w.pct ?? 0,
                  display: w.pct == null ? 'мэдээлэлгүй' : `${pct(w.pct, 1)} · ${num(w.blocks)} блок`,
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
  taskCount: number;
  done: number;                // дууссан (гүйц ≥ 1)
  inProgress: number;          // явцтай (0 < гүйц < 1)
  notStarted: number;          // эхлээгүй (гүйц ≤ 0)
  /** Энэ блокийн «Б.» мөрийн түүх — явцын муруйд */
  hist: BlockHistory;
  key: string;
};

/** Мөрийн онц — ажлын нэр давхрын хэсэг тус бүрд ДАВТАГДАНА, тиймээс
 *  `applySections`-ийн стампалсан хэсэг (`angilal_b`) түлхүүрт ЗААВАЛ орно. */
const rowKey = (a: Record<string, unknown>) =>
  `${text(a[TS.section])}|${text(a[TS.level])}|${text(a[TS.work])}`;

/**
 * Тухайн блокийн ажлын гүйцэтгэл — БҮГД «Гүйцэтгэл бөглөх»-ийн нэгтгэсэн
 * хүснэгтээс.
 *
 *   нийт %       «Б.» мөрийн тухайн барилгын нүд (`loadBlockProgress` — газрын
 *                зургийн өнгөтэй ЯГ нэг эх сурвалж, Бэлтгэл ажил ОРОХГҮЙ)
 *   үе шат       «Б1»…«Б5» мөрүүд
 *   ажлын төлөв  «Б.»-ийн доорх навч мөрүүд (Түвшин 5), as-of сүүлийн утгаар
 *
 * ⚠️ БЛОКИЙН НЭР БАГЦААР ДАВТАГДАНА («5/1» долоон багцад тус бүрдээ өөр барилга)
 * тул `barilga_blok LIKE`-аас гадна Багцаар ЗААВАЛ шүүнэ.
 *
 * ⚠️ Дуудагч (ViewPanel-ийн MonitorPanel) НЭГ УДАА дуудаж `MonitorGeneral` ба
 * `MonitorDetail`-д prop-оор өгнө. Урьд нь хоёулаа тус тусдаа дууддаг байсан
 * тул хуудаслалттай ижил хүнд queryAll (блокийн түүх 2000+ мөр давдаг) барилга
 * сонгох бүрд ХОЁР ДАВХАР явдаг байв.
 */
export function useTaskPerf(b: PickedBuilding | null): Async<TaskPerfData | null> {
  const blok = b?.blok ?? null;
  const bagts = b?.bagts ?? null;
  return useAsync(async () => {
    if (!blok) return null;
    const [feats, prog, hist] = await Promise.all([
      // «5/1» → «5/1 барилга» / «5/1 блок». Огноо+OID дараалал нь as-of болон
      // хэсэг стампалахад ЗААВАЛ шаардлагатай.
      queryAll(`${TS.block} LIKE '${qesc(blok)} %' AND ${ACTUAL}`, {
        outFields: [
          TASK_SHEET.oid, TS.bagts, TS.block, TS.date, TS.version,
          TS.level, TS.no, TS.work, TS.weight, TS.section, TS.progress,
        ].join(','),
        orderByFields: `${TS.date} ASC, ${TASK_SHEET.oid} ASC`,
      }),
      loadBlockProgress().catch(() => null),
      loadBlockHistory(),
    ]);
    const key = buildingKey(bagts, blok);
    const cell = prog?.get(key) ?? null;
    const mine = feats.filter((f) => bagtsKey(f.attributes[TS.bagts]) === bagtsKey(bagts));
    if (!mine.length) return cell ? { ...emptyPerf(cell), hist, key } : null;

    applySections(mine); // давхрын хэсгийг `angilal_b`-д стампална

    // Үе шат (А. Бэлтгэл / Б. Барилга угсралт) — upload багц бүрд түвшин-1
    // мөрөөс доош тархана. Ажлын төлөв ЗӨВХӨН Б.-ийн навчаар тоологдоно:
    // нийт гүйцэтгэл нь мөн Б. үе шатынх (Бэлтгэл ажил ороогүй).
    const phase = new Map<string, string>();
    const batches = new Map<string, Feature[]>();
    for (const f of mine) {
      const k = `${text(f.attributes[TS.date])}|${text(f.attributes[TS.version])}`;
      const arr = batches.get(k);
      if (arr) arr.push(f); else batches.set(k, [f]);
    }
    for (const arr of batches.values()) {
      let cur = '';
      for (const f of arr) {
        const a = f.attributes;
        if (Number(a[TS.level]) === 1) cur = text(a[TS.no]);
        phase.set(rowKey(a), cur);
      }
    }

    // As-of: нүд бүрээр СҮҮЛИЙН утга (мөрүүд Огноо ASC, OID ASC тул сүүлийнх ялна)
    const win = new Map<string, Record<string, unknown>>();
    let maxDate = '';
    for (const f of mine) {
      const a = f.attributes;
      win.set(rowKey(a), a);
      const d = text(a[TS.date]);
      if (d > maxDate) maxDate = d;
    }

    let done = 0, inProgress = 0, notStarted = 0;
    for (const [k, a] of win) {
      if (Number(a[TS.level]) !== 5) continue;
      if (phase.get(k) !== TASK_SHEET.constructionNo) continue;
      const p = Number(a[TS.progress]) || 0;
      if (p >= 1) done += 1; else if (p > 0) inProgress += 1; else notStarted += 1;
    }
    const taskCount = done + inProgress + notStarted;
    if (!taskCount && !cell) return null;

    return {
      version: cell?.date || maxDate,
      overall: cell?.overall ?? null,
      headers: phasesOf(cell),
      taskCount, done, inProgress, notStarted,
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
  taskCount: 0, done: 0, inProgress: 0, notStarted: 0,
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
 * ⚠️ ЗӨВХӨН «Гүйцэтгэл бөглөх»-ийн нэгтгэсэн хүснэгт — shapefile талбар БИШ.
 * ⚠️ `b`/`q`-г дуудагч НЭГ УДАА бэлдэж өгнө (`useTaskPerf`-ийн тайлбар) —
 *    энд өөрөө дуудвал `MonitorDetail`-тай давхар хүсэлт явна.
 */
export function MonitorGeneral({ b, q }: { b: PickedBuilding | null; q: Async<TaskPerfData | null> }) {
  if (!b) {
    return <Section><Empty label="Барилга сонгоогүй байна." /></Section>;
  }
  return (
    <Data q={q} loading="Ажлын гүйцэтгэл татаж байна…">
      {(d) => {
        if (!d) return <Section title="Ажлын гүйцэтгэл"><Empty label={`«${b.blok}» блокийн ажлын гүйцэтгэл хараахан бүртгэгдээгүй байна.`} /></Section>;
        return (
          <>
            <Section tone="primary" title={`${b.blok} — нийт гүйцэтгэл`} note={d.version}>
              <Col gap="sm">
                <Ring value={d.overall ?? 0} color={HUE} size={104} width={11} label="угсралт" />
                <Note>
                  {d.overall == null
                    ? 'Барилга угсралтын ажлын гүйцэтгэл хараахан бөглөгдөөгүй.'
                    : `«Б. Барилга угсралтын ажил» үе шатын гүйцэтгэл (Бэлтгэл ажил ороогүй). Задаргаа «${num(d.taskCount)}» ажлаар.`}
                </Note>
              </Col>
            </Section>

            <Section title="Ажлын төлөв" note={`${num(d.taskCount)} ажил`}>
              <Stats cols={3}>
                <Stat value={num(d.done)} unit="ажил" label="Дууссан" color="var(--good)" />
                <Stat value={num(d.inProgress)} unit="ажил" label="Явцтай" color={HUE} accent />
                <Stat value={num(d.notStarted)} unit="ажил" label="Эхлээгүй" color="var(--ink-3)" />
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
 * ⚠️ ЗӨВХӨН «Гүйцэтгэл бөглөх»-ийн нэгтгэсэн хүснэгт.
 * ⚠️ `b`/`q`-г дуудагч НЭГ УДАА бэлдэж өгнө (`useTaskPerf`-ийн тайлбар).
 */
export function MonitorDetail({ b, q }: { b: PickedBuilding | null; q: Async<TaskPerfData | null> }) {
  if (!b) {
    return <Section><Empty label="Барилга сонгоогүй байна." /></Section>;
  }
  return (
    <Data q={q} loading="Ажлын гүйцэтгэл татаж байна…">
      {(d) => {
        if (!d) return <Section title="Гүйцэтгэл үе шатаар"><Empty label="Мэдээлэл алга." /></Section>;
        return (
          <>
            {/* Энэ блокийн «Б.» мөрийн бүртгэл бүхэн — хэзээ хурдалсныг харуулна */}
            <BlockTrend hist={d.hist} blockKey={d.key} />

            {d.headers.length > 0 && (
              <Section title="Барилга угсралтын ажил" note={`${d.headers.length} үе шат · ${d.version}`}>
                <Bars
                  color={HUE}
                  max={100}
                  items={d.headers.map((h, i) => ({
                    key: `${i}:${h.name}`,
                    label: h.name,
                    value: h.progress ?? 0,
                    display: h.progress == null ? 'мэдээлэлгүй' : pct(h.progress, 0),
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
