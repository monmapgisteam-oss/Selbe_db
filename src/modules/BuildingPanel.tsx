'use client';

import { useEffect, useState } from 'react';
import { Section, Stats, Stat, Bars, Stack, Ring, Rows, Data, Chip, Empty, List, ListItem, Tabs, Col, Note, Split } from '@/components/ui';
import { useFilter } from '@/lib/filter';
import { useAsync, type Async } from '@/lib/useAsync';
import { queryGroup, queryStats, queryCount, queryFeatures, count, sum, avg, sqlStr, groups } from '@/lib/query';
import { BUILDING, BUILDING_STAGES, PROGRESS_LEVELS, STAGE_NA, TASK_PERF, LAYER_BY_ID } from '@/lib/services';
import { num, pct, date, text } from '@/lib/format';

const HUE = LAYER_BY_ID['mon:building'].hue;
const F = BUILDING.fields;

/** Гүйцэтгэл бүртгэгдсэн (-1 биш) блокууд — ЗӨВХӨН дундаж бодоход хэрэглэнэ */
const HAS_PROGRESS = `${F.progress} >= ${STAGE_NA + 1}`;

/**
 * Барилгын блокуудын нэгдсэн гүйцэтгэл — блок, айл, дундаж %, түвшин, багц, үе
 * шат, гүйцэтгэгч. `BuildingSummary` ба ерөнхий `Dashboard` хоёулаа энэ hook-ыг
 * дуудна — нэг эх сурвалж, дүн зөрөхгүй.
 */
export function useBuildings() {
  return useAsync(async () => {
    const [totalsAll, totalsAvg, levels, cntBagts, avgBagts, cntComp, avgComp, stages] =
      await Promise.all([
        // ⚠️ Блок ба айлын ТОО — БҮХ бичлэгээс. Гүйцэтгэлийн шүүлт энд орвол
        //    гүйцэтгэл бүртгэгдээгүй блокууд тооллогоос чимээгүй унана.
        queryStats(BUILDING.url, [count(BUILDING.oid, 'n'), sum(F.households, 'ail')]),
        queryStats(BUILDING.url, [avg(F.progress, 'g'), avg(F.floors, 'dav')], HAS_PROGRESS),

        // 4 түвшин — тус бүрийг тусад нь тоолно (SQL нь [min, max) хагас нээлттэй)
        Promise.all(
          PROGRESS_LEVELS.map((l) =>
            queryCount(BUILDING.url, `${F.progress} >= ${l.min} AND ${F.progress} < ${l.max}`),
          ),
        ),

        queryGroup(BUILDING.url, F.bagts, [count(BUILDING.oid, 'n'), sum(F.households, 'ail')]),
        queryGroup(BUILDING.url, F.bagts, [avg(F.progress, 'g')], HAS_PROGRESS),

        queryGroup(BUILDING.url, F.contractor, [count(BUILDING.oid, 'n')]),
        queryGroup(BUILDING.url, F.contractor, [avg(F.progress, 'g')], HAS_PROGRESS),

        // Үе шат бүрийн дундаж — тухайн ажил ТӨЛӨВЛӨГДСӨН блокуудаар л (утга > -1)
        Promise.all(
          BUILDING_STAGES.map((st) =>
            queryStats(BUILDING.url, [avg(st.field, 'g'), count(BUILDING.oid, 'n')], `${st.field} > ${STAGE_NA}`),
          ),
        ),
      ]);

    // ArcGIS нь null ба ' ' -г тусад нь бүлэглэдэг — groups() нэгтгэнэ.
    // (Урьд нь text()-ээр шууд хөрвүүлдэг байсан тул хоёр «Тодорхойгүй» мөр гарч,
    //  тоо нь хуваагдаж, React-ийн key давхардаж байлаа.)
    const bagtsN = groups(cntBagts, F.bagts, 'Тодорхойгүй', ['n', 'ail']);
    const bagtsG = groups(avgBagts, F.bagts, 'Тодорхойгүй', ['g']);
    const compN = groups(cntComp, F.contractor, 'Тодорхойгүй', ['n']);
    const compG = groups(avgComp, F.contractor, 'Тодорхойгүй', ['g']);

    return {
      blocks: Number(totalsAll.n ?? 0),
      households: Number(totalsAll.ail ?? 0),
      progress: totalsAvg.g == null ? null : Number(totalsAvg.g),
      floors: totalsAvg.dav == null ? null : Number(totalsAvg.dav),

      levels: PROGRESS_LEVELS.map((l, i) => ({ ...l, value: levels[i] })),

      bagts: bagtsN
        .map((g) => ({
          key: g.label,
          blocks: g.values.n,
          ail: g.values.ail,
          progress: bagtsG.find((x) => x.label === g.label)?.values.g ?? null,
        }))
        .sort((a, b) => a.key.localeCompare(b.key, 'mn')),

      contractors: compN
        .map((g) => ({
          key: g.label,
          blocks: g.values.n,
          progress: compG.find((x) => x.label === g.label)?.values.g ?? null,
        }))
        .sort((a, b) => b.blocks - a.blocks),

      stages: BUILDING_STAGES.map((st, i) => ({
        key: st.field,
        label: st.label,
        value: stages[i].g == null ? null : Number(stages[i].g),
        blocks: Number(stages[i].n ?? 0),
      })),
    };
  }, []);
}

/* ═════════════ ЗҮҮН багана — бүх блокийн нэгдсэн үзүүлэлт ═════════════ */

export function BuildingSummary() {
  const q = useBuildings();
  const { toggle, active } = useFilter();

  const pickLevel = (key: string) => {
    const l = PROGRESS_LEVELS.find((x) => x.key === key)!;
    toggle({
      key: `building:level:${key}`,
      label: `${l.label} · ${l.range}`,
      group: 'Гүйцэтгэлийн ангилал',
      where: `${F.progress} >= ${l.min} AND ${F.progress} < ${l.max}`,
      view: 'monitor',
      // Гүйцэтгэлийн талбар (`GUITS_HV`) нь ЗӨВХӨН хяналтын блокийн давхаргад
      // байна — бусад давхаргад тавибал ArcGIS хүсэлт унана
      layerIds: 'mon:building',
      color: l.color,
    });
  };

  const pickBagts = (key: string) => {
    toggle({
      key: `building:bagts:${key}`,
      label: key,
      group: 'Багц',
      where: `${F.bagts} = ${sqlStr(key)}`,
      view: 'monitor',
      layerIds: 'mon:building',
      color: HUE,
    });
  };

  /** Идэвхтэй шүүлтийн түлхүүрээс тухайн жагсаалтын сонголтыг сэргээнэ */
  const selected = (prefix: string) =>
    active?.key.startsWith(prefix) ? active.key.slice(prefix.length) : null;

  return (
    <Data q={q}>
      {(d) => (
        <>
          <Section tone="primary">
            <Col gap="md">
              <Stats cols={2}>
                <Stat value={num(d.blocks)} label="Барилгын блок" color={HUE} accent />
                <Stat value={num(d.households)} label="Айлын тоо" color={HUE} accent />
              </Stats>
              <Split aside={<Ring value={d.progress} color={HUE} size={78} width={8} />}>
                <Note>
                  {num(d.blocks)} блокийн дундаж гүйцэтгэл. Дундаж {num(d.floors, 1)} давхар.
                  Төлөвлөгдөөгүй ажлыг (утга −1) хассан.
                </Note>
              </Split>
            </Col>
          </Section>

          <Section title="Гүйцэтгэлийн ангилал" note="дарж шүүнэ">
            <Col gap="md">
              <Stack
                legend={false}
                total={d.blocks}
                items={d.levels.map((l) => ({ key: l.key, label: l.label, value: l.value, color: l.color }))}
              />
              <Bars
                max={Math.max(1, ...d.levels.map((l) => l.value))}
                selected={selected('building:level:')}
                onSelect={pickLevel}
                items={d.levels.map((l) => ({
                  key: l.key,
                  label: `${l.label} · ${l.range}`,
                  value: l.value,
                  display: `${num(l.value)} блок`,
                  color: l.color,
                }))}
              />
            </Col>
          </Section>

          <Section title="Багц тус бүрээр" note="дарж шүүнэ">
            <Bars
              color={HUE}
              max={100}
              selected={selected('building:bagts:')}
              onSelect={pickBagts}
              items={d.bagts.map((b) => ({
                key: b.key,
                label: `${b.key} · ${num(b.blocks)} блок`,
                value: b.progress ?? 0,
                // null = гүйцэтгэл бүртгэгдээгүй. «0.0%» гэж бичвэл жинхэнэ 0%-аас ялгагдахгүй.
                display: b.progress == null ? 'мэдээлэлгүй' : pct(b.progress),
              }))}
            />
          </Section>

          <Section title="Ажлын үе шат" note="төлөвлөгдсөн блокуудын дундаж">
            <Bars
              color={HUE}
              max={100}
              items={d.stages.map((st) => ({
                key: st.key,
                label: st.label,
                value: st.value ?? 0,
                display: st.blocks === 0 || st.value == null ? 'төлөвлөгдөөгүй' : pct(st.value),
              }))}
            />
          </Section>

          <Section title="Гүйцэтгэгч компани">
            <Bars
              color={HUE}
              max={100}
              items={d.contractors.map((c) => ({
                key: c.key,
                label: `${c.key} · ${num(c.blocks)} блок`,
                value: c.progress ?? 0,
                display: c.progress == null ? 'мэдээлэлгүй' : pct(c.progress),
              }))}
            />
          </Section>
        </>
      )}
    </Data>
  );
}

/* ═════════════ Блокийн талбайн тайлан — төлөвлөгөө ↔ бодит ═════════════ */

/* ═════════════ Блокийн АЖЛЫН ГҮЙЦЭТГЭЛ — «Төслийн гүйцэтгэл» service ═════════════ */

const TP = TASK_PERF.fields;

type HeaderWork = { name: string; progress: number | null; level: number };
type TaskPerfData = {
  version: string;              // «2026-07-23» — сүүлийн шинэчлэлтийн огноо
  overall: number;             // ажлаар жигнэсэн гүйцэтгэл (0–100)
  headers: HeaderWork[];       // толгой (header) ажлууд өөрсдийн гүйцэтгэлээр
  taskCount: number;
  done: number;                // дууссан (гүйц ≥ 1)
  inProgress: number;          // явцтай (0 < гүйц < 1)
  notStarted: number;          // эхлээгүй (гүйц ≤ 0)
};

const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Толгой (header) ажил уу? Навч = Түвшин 3 + бутархай жин. Гүйцэтгэл бөглөх
 *  хуудасны `isHeaderAttrs`-тэй яг адил дүрэм (давхрын толгойнууд 0/2 гэх мэт
 *  бохир жинтэй; Түвшин-3 бүлгийн мөр яг 1 жинтэй). */
const isHdr = (r: Record<string, unknown>) => {
  const w = r[TP.weight] == null ? null : Number(r[TP.weight]);
  return Number(r[TP.level]) !== 3 || (w != null && Math.abs(w - 1) < 1e-6);
};

/**
 * Тухайн блокийн ажлын гүйцэтгэл — «Төслийн гүйцэтгэл» хүснэгтээс (нээлттэй).
 * «Гүйцэтгэл бөглөх» хуудастай ЯГ адил as-of логик: `Барилга_Блок LIKE '{BLOK} %'`
 * -ээр бүх огноо/хувилбарыг татаад, ажил бүрээр ХАМГИЙН СҮҮЛИЙН утгыг (Огноо→OID
 * дарааллаар) авна — тиймээс өнөөдөр цөөн нүд засаад нийтэлсэн ч бүтэн хуудас
 * харагдана. Навч ажлыг (Түвшин 3) жингээр жигнэж нийт %, толгой ажлуудыг
 * өөрсдийн бүртгэсэн гүйцэтгэлээр нь тусад нь гаргана.
 */
function useTaskPerf(blok: string | null): Async<TaskPerfData | null> {
  return useAsync(async () => {
    if (!blok) return null;
    const rows = await queryFeatures(TASK_PERF.url, {
      where: `${TP.block} LIKE ${sqlStr(`${blok} %`)}`,
      outFields: [TASK_PERF.oid, TP.block, TP.date, TP.version, TP.level, TP.catA, TP.task, TP.weight, TP.progress],
      limit: 8000,
    });
    // Зөвхөн хүчинтэй огноотой мөрүүд — «undefined» гэх бохир өгөгдлийг хасна
    const valid = rows.filter((r) => isValidDate(text(r[TP.date])));
    if (!valid.length) return null;

    // Upload багц (Огноо|Хувилбар|Блок) бүрд OID дарааллаар толгой ажлыг доорх
    // навчид «section» болгон стамплана — давхар бүрд давтагдах ажил (Ханын
    // арматур гэх мэт) хоорондоо нийлэхээс сэргийлнэ.
    const batches = new Map<string, Record<string, unknown>[]>();
    for (const r of valid) {
      const k = `${text(r[TP.date])}|${text(r[TP.version])}|${text(r[TP.block])}`;
      const a = batches.get(k);
      if (a) a.push(r); else batches.set(k, [r]);
    }
    const secOf = new WeakMap<object, string>();
    for (const b of batches.values()) {
      b.sort((x, y) => Number(x[TASK_PERF.oid]) - Number(y[TASK_PERF.oid]));
      let sec = '';
      for (const r of b) {
        if (isHdr(r)) sec = text(r[TP.task]);
        secOf.set(r, isHdr(r) ? text(r[TP.task]) : sec);
      }
    }
    // Толгой ажлын дараалал — хамгийн бүрэн (олон мөртэй) багцаас template.
    let ref: Record<string, unknown>[] = [];
    for (const b of batches.values()) if (b.length > ref.length) ref = b;
    const hOrder = new Map<string, number>();
    ref.forEach((r, i) => { if (isHdr(r) && !hOrder.has(text(r[TP.task]))) hOrder.set(text(r[TP.task]), i); });

    // As-of сүүлийн утга ажил бүрээр: Огноо ASC, OID ASC → сүүлийнх нь ялна.
    valid.sort((a, b) => {
      const da = text(a[TP.date]), db = text(b[TP.date]);
      if (da !== db) return da < db ? -1 : 1;
      return Number(a[TASK_PERF.oid]) - Number(b[TASK_PERF.oid]);
    });
    const win = new Map<string, Record<string, unknown>>();
    let maxDate = '';
    for (const r of valid) {
      const k = `${text(r[TP.level])}|${text(r[TP.catA])}|${secOf.get(r) ?? ''}|${text(r[TP.task])}`;
      win.set(k, r);
      const d = text(r[TP.date]);
      if (d > maxDate) maxDate = d;
    }
    const latest = [...win.values()];

    // Навч ажлууд (Түвшин 3) — нийт жигнэсэн гүйцэтгэл + төлөв
    const leaves = latest.filter((r) => Number(r[TP.level]) === 3 && !isHdr(r));
    let twp = 0, tw = 0, done = 0, inProgress = 0, notStarted = 0;
    for (const r of leaves) {
      const w = Number(r[TP.weight]) || 0;
      const p = Number(r[TP.progress]) || 0;
      twp += w * p; tw += w;
      if (p >= 1) done += 1; else if (p > 0) inProgress += 1; else notStarted += 1;
    }
    if (!leaves.length && !latest.length) return null;

    // Толгой ажлууд — өөрсдийн бүртгэсэн гүйцэтгэлээр (template дараалалд)
    const headers = latest
      .filter((r) => isHdr(r))
      .map((r) => ({
        name: text(r[TP.task]).replace(/\s+/g, ' ').replace(/^[A-Za-zА-Яа-яӨөҮү]\.\s*/, '').trim(),
        progress: r[TP.progress] == null ? null : Number(r[TP.progress]) * 100,
        level: Number(r[TP.level]) || 0,
        order: hOrder.get(text(r[TP.task])) ?? Number.MAX_SAFE_INTEGER,
      }))
      .filter((h) => h.name)
      .sort((a, b) => a.order - b.order)
      .map(({ order: _o, ...h }) => h);

    return {
      version: maxDate,
      overall: tw ? (twp / tw) * 100 : 0,
      headers,
      taskCount: leaves.length,
      done, inProgress, notStarted,
    };
  }, [blok]);
}

/** Сонгосон барилгын блокийн дугаар (BLOK) — бусад тохиолдолд null */
function pickedBlok(picked: Record<string, unknown> | null, pickedLayer: string | null): string | null {
  if (picked == null || pickedLayer !== 'mon:building') return null;
  return text(picked[F.block], '').trim() || null;
}

/**
 * ЗҮҮН — барилгын ЕРӨНХИЙ гүйцэтгэл: нийт % (ажлаар жигнэсэн) + ажлын төлөв.
 * ⚠️ ЗӨВХӨН «Төслийн гүйцэтгэл» table service — барилгын shapefile талбар БИШ.
 */
export function MonitorGeneral({ picked, pickedLayer }: { picked: Record<string, unknown> | null; pickedLayer: string | null }) {
  const blok = pickedBlok(picked, pickedLayer);
  const q = useTaskPerf(blok);
  if (!blok) {
    return <Section><Empty label="Газрын зураг дээр барилга дээр дарж тухайн блокийн ажлын гүйцэтгэлийг харна уу." /></Section>;
  }
  return (
    <Data q={q} loading="Ажлын гүйцэтгэл татаж байна…">
      {(d) => {
        if (!d) return <Section title="Ажлын гүйцэтгэл"><Empty label={`«${blok}» блокийн ажлын гүйцэтгэл хараахан бүртгэгдээгүй байна.`} /></Section>;
        return (
          <>
            <Section tone="primary" title={`${blok} — нийт гүйцэтгэл`} note={d.version}>
              <Col gap="sm">
                <Ring value={d.overall} color={HUE} size={104} width={11} label="ажлаар" />
                <Note>«{num(d.taskCount)}» ажлын гүйцэтгэлийг жингээр (Хувийн жин) жигнэв.</Note>
              </Col>
            </Section>

            <Section title="Ажлын төлөв" note={`${num(d.taskCount)} ажил`}>
              <Stats cols={3}>
                <Stat value={num(d.done)} label="Дууссан" color="var(--good)" />
                <Stat value={num(d.inProgress)} label="Явцтай" color={HUE} accent />
                <Stat value={num(d.notStarted)} label="Эхлээгүй" color="var(--ink-3)" />
              </Stats>
            </Section>
          </>
        );
      }}
    </Data>
  );
}

/**
 * БАРУУН — ажлын ДЭЛГЭРЭНГҮЙ гүйцэтгэл: ангилал бүрийн жигнэсэн явц (бар).
 * ⚠️ ЗӨВХӨН «Төслийн гүйцэтгэл» table service.
 */
export function MonitorDetail({ picked, pickedLayer }: { picked: Record<string, unknown> | null; pickedLayer: string | null }) {
  const blok = pickedBlok(picked, pickedLayer);
  const q = useTaskPerf(blok);
  if (!blok) {
    return <Section><Empty label="Барилга сонгоход ажлын дэлгэрэнгүй гүйцэтгэл (ангиллаар) энд гарна." /></Section>;
  }
  return (
    <Data q={q} loading="Ажлын гүйцэтгэл татаж байна…">
      {(d) => {
        if (!d || !d.headers.length) return <Section title="Гүйцэтгэл толгой ажлаар"><Empty label="Мэдээлэл алга." /></Section>;
        return (
          <Section title="Гүйцэтгэл толгой ажлаар" note={`${d.headers.length} ажил · ${d.version}`}>
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
        );
      }}
    </Data>
  );
}

