'use client';

import { useEffect, useState } from 'react';
import { Section, Stats, Stat, Bars, Stack, Ring, Rows, Data, Chip, Empty, List, ListItem, Tabs } from '@/components/ui';
import { useMap } from '@/components/MapCanvas';
import { useAsync } from '@/lib/useAsync';
import { queryGroup, queryStats, queryCount, count, sum, avg, sqlStr, groups } from '@/lib/query';
import { BUILDING, BUILDING_STAGES, PROGRESS_LEVELS, STAGE_NA, SURVEY, SURVEY_HUE, LAYER_BY_ID } from '@/lib/services';
import { useSurvey, useOutside, reportsForBlock, ReportDetail, SurveyReports, SurveyOutside } from './SurveyPanel';
import { num, pct, date, text } from '@/lib/format';

const HUE = LAYER_BY_ID['mon:building'].hue;
const F = BUILDING.fields;

/** Гүйцэтгэл бүртгэгдсэн (-1 биш) блокууд — ЗӨВХӨН дундаж бодоход хэрэглэнэ */
const HAS_PROGRESS = `${F.progress} >= ${STAGE_NA + 1}`;

function useBuildings() {
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
  const { setHighlight } = useMap();
  const [level, setLevel] = useState<string | null>(null);
  const [bagts, setBagts] = useState<string | null>(null);

  const pickLevel = (key: string) => {
    const l = PROGRESS_LEVELS.find((x) => x.key === key)!;
    const next = level === key ? null : key;
    setLevel(next);
    setBagts(null);
    setHighlight(next ? `${F.progress} >= ${l.min} AND ${F.progress} < ${l.max}` : null);
  };

  const pickBagts = (key: string) => {
    const next = bagts === key ? null : key;
    setBagts(next);
    setLevel(null);
    setHighlight(next ? `${F.bagts} = ${sqlStr(next)}` : null);
  };

  return (
    <Data q={q}>
      {(d) => (
        <>
          <Section>
            <Stats cols={2}>
              <Stat value={num(d.blocks)} label="Барилгын блок" color={HUE} accent />
              <Stat value={num(d.households)} label="Айлын тоо" color={HUE} accent />
            </Stats>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
              <Ring value={d.progress} color={HUE} size={78} width={8} />
              <p style={{ fontSize: '0.72rem', lineHeight: 1.5, color: 'var(--ink-3)' }}>
                {num(d.blocks)} блокийн дундаж гүйцэтгэл. Дундаж {num(d.floors, 1)} давхар.
                Төлөвлөгдөөгүй ажлыг (утга −1) хассан.
              </p>
            </div>
          </Section>

          <Section title="Гүйцэтгэлийн ангилал" note="дарж шүүнэ">
            <Stack
              legend={false}
              total={d.blocks}
              items={d.levels.map((l) => ({ key: l.key, label: l.label, value: l.value, color: l.color }))}
            />
            <div style={{ marginTop: 14 }}>
              <Bars
                max={Math.max(1, ...d.levels.map((l) => l.value))}
                selected={level}
                onSelect={pickLevel}
                items={d.levels.map((l) => ({
                  key: l.key,
                  label: `${l.label} · ${l.range}`,
                  value: l.value,
                  display: `${num(l.value)} блок`,
                  color: l.color,
                }))}
              />
            </div>
          </Section>

          <Section title="Багц тус бүрээр" note="дарж шүүнэ">
            <Bars
              color={HUE}
              max={100}
              selected={bagts}
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

/**
 * Сонгосон блокт бичигдсэн талбайн хяналтын тайлангууд.
 *
 * Энэ бол хоёр модулийг нэгтгэсний ГОЛ УТГА: төлөвлөгөөний гүйцэтгэл (барилгын
 * давхарга) ба талбар дээр биечлэн баталгаажуулсан гүйцэтгэл (Survey123) хоёрыг
 * зэрэгцүүлж, зөрүүг нь шууд харуулна.
 */
function BlockReports({
  q,
  blok,
  planned,
}: {
  q: ReturnType<typeof useSurvey>;
  blok: unknown;
  planned: number;
}) {
  const [selId, setSelId] = useState<string | null>(null);
  const code = text(blok, '').trim();

  return (
    <Data q={q}>
      {(d) => {
        const mine = reportsForBlock(d.reports, blok);

        if (mine.length === 0) {
          return (
            <Section title="Талбайн хяналт">
              <Empty
                label={
                  code
                    ? `«${code}» блокт талбайн хяналтын тайлан хараахан ирээгүй байна.`
                    : 'Энэ блокийн дугаар бүртгэгдээгүй тул тайлантай холбох боломжгүй.'
                }
              />
            </Section>
          );
        }

        // Хамгийн сүүлийн тайлангийн хэмжсэн гүйцэтгэл — төлөвлөгөөтэй харьцуулна
        const latest = mine[0];
        // ⚠️ `?? 0` хийвэл «хянагч талбар дээр 0% хэмжсэн» гэж ХУДЛАА батална.
        //    Хэмжилт байхгүй бол зөрүү ч утгагүй — хоёуланг нь нуух ёстой.
        const raw = latest[SURVEY.fields.total];
        const measured = raw == null ? null : Number(raw);
        const gap = measured == null ? null : measured - planned;

        const active = mine.find((r) => String(r.globalid) === selId);

        return (
          <>
            <Section title="Төлөвлөгөө ↔ талбайн хэмжилт" note={`${mine.length} тайлан`}>
              <Stats cols={3}>
                <Stat value={pct(planned, 0)} label="Төлөвлөгөөгөөр" color={HUE} />
                <Stat
                  value={measured == null ? '—' : pct(measured, 0)}
                  label="Талбар дээр"
                  color={SURVEY_HUE}
                  accent
                />
                <Stat
                  value={gap == null ? '—' : `${gap >= 0 ? '+' : ''}${pct(gap, 0)}`}
                  label={gap == null ? 'Зөрүү — хэмжилтгүй' : 'Зөрүү'}
                  color={gap == null ? undefined : gap >= 0 ? 'var(--good)' : 'var(--bad)'}
                />
              </Stats>
              <p style={{ marginTop: 12, fontSize: '0.71rem', lineHeight: 1.5, color: 'var(--ink-3)' }}>
                Талбайн утга нь <b style={{ color: 'var(--ink)' }}>{date(latest[SURVEY.fields.date] as string)}</b>-ний
                хамгийн сүүлийн тайлангийн «Б. Барилга угсралт»-ын гүйцэтгэл. Хоёр тоо ӨӨР аргаар
                хэмжигддэг тул зөрүү нь заавал алдаа гэсэн үг биш — шалгах шаардлагатайг заана.
              </p>
            </Section>

            <Section title="Энэ блокийн тайлан" note="дарж дэлгэрэнгүйг харна">
              <List>
                {mine.map((r) => {
                  const id = String(r.globalid);
                  const n = (d.byParent.get(id) ?? []).length;
                  return (
                    <ListItem
                      key={id}
                      color={SURVEY_HUE}
                      active={id === selId}
                      onClick={() => setSelId(id === selId ? null : id)}
                      title={date(r[SURVEY.fields.date] as string)}
                      sub={`${text(r[SURVEY.fields.user])}${n ? ` · ${n} асуудал` : ''}`}
                      value={pct(Number(r[SURVEY.fields.total] ?? 0), 0)}
                    />
                  );
                })}
              </List>
            </Section>

            {active && <ReportDetail r={active} issues={d.byParent.get(String(active.globalid)) ?? []} />}
          </>
        );
      }}
    </Data>
  );
}

/* ═════════════ ҮНДСЭН самбар — дарсан зүйлээс хамаарна ═════════════ */

/**
 * Нэгтгэсэн модулийн үндсэн самбар — ГУРВАН таб.
 *
 *   · Блок     — сонгосон барилгын гүйцэтгэл + түүний талбайн тайлан
 *   · Тайлан   — талбайн хяналтын тайлангийн бүрэн жагсаалт
 *   · Байрлал  — хилээс гадуур бүртгэгдсэн тайлангийн сануулга
 *
 * Хоёр модулийг нэгтгэхэд агуулга нь ~10 хэсгийн урт өрлөг болж, шатлал алдагдсан
 * тул сэдвээр нь салгав. Гурван таб бүгд БАЙНГА байрандаа — зөвхөн нэг дор
 * харагдахаа больсон.
 *
 * ⚠️ Асинк хүсэлтүүдийг ГАДНААС (`MonitorPanel`) авна. Урьд нь энэ компонент
 *    өөрөө `useSurvey()`/`useOutside()` дууддаг байсан бөгөөд эцэг нь мөн адил
 *    дууддаг байсан тул ижил хүсэлт ХОЁР УДАА явдаг байв.
 */
export function BuildingWork({
  picked,
  pickedLayer,
  survey,
  outside,
}: {
  picked: Record<string, unknown> | null;
  pickedLayer: string | null;
  survey: ReturnType<typeof useSurvey>;
  outside: ReturnType<typeof useOutside>;
}) {
  const isBuilding = picked != null && pickedLayer === 'mon:building';
  const isSurvey = picked != null && pickedLayer === 'mon:survey';

  const [tab, setTab] = useState<'block' | 'reports' | 'location'>('block');

  /**
   * Газрын зураг дээр дарахад тохирох таб өөрөө нээгдэнэ — эс бөгөөс хэрэглэгч
   * цэг дарсан ч өөр табанд байгаа тул юу ч болоогүй мэт харагдана.
   *
   * Сонголтын ТҮЛХҮҮРЭЭР хянана: ижил төрлийн өөр объект дарахад ч дахин ажиллана.
   */
  const pickKey = picked ? `${pickedLayer}:${picked[BUILDING.oid] ?? picked.globalid ?? ''}` : null;
  useEffect(() => {
    if (!pickKey) return;
    if (pickKey.startsWith('mon:building')) setTab('block');
    else if (pickKey.startsWith('mon:survey')) setTab('reports');
  }, [pickKey]);

  const planned = (() => {
    if (!isBuilding) return 0;
    const raw = picked[F.progress];
    return raw == null || Number(raw) === STAGE_NA ? 0 : Number(raw);
  })();

  return (
    <>
      <Tabs
        value={tab}
        onChange={(k) => setTab(k as typeof tab)}
        items={[
          { key: 'block', label: 'Блок' },
          {
            key: 'reports',
            label: 'Тайлан',
            count: survey.state === 'ready' ? survey.data.count : null,
          },
          {
            key: 'location',
            label: 'Байрлал',
            count: outside.state === 'ready' ? outside.data.total : null,
            // Хилээс гадуур бичигдсэн тайлан бол ӨГӨГДЛИЙН ЧАНАРЫН асуудал.
            // Таб нуугдсан ч улаан тоо нь хэрэглэгчийн нүдэнд өртөнө.
            warn: true,
          },
        ]}
      />

      {tab === 'block' &&
        (isBuilding ? (
          <>
            <BuildingDetail picked={picked} />
            <BlockReports q={survey} blok={picked[F.block]} planned={planned} />
          </>
        ) : (
          <Section>
            <Empty label="Газрын зураг дээр барилга дээр дарж тухайн блокийн гүйцэтгэл, түүнд бичигдсэн талбайн тайланг харна уу." />
          </Section>
        ))}

      {tab === 'reports' && (
        <SurveyReports q={survey} pickedId={isSurvey ? String(picked.globalid ?? '') : null} />
      )}

      {tab === 'location' && <SurveyOutside q={outside} />}
    </>
  );
}

/* ═════════════ Сонгосон нэг блок ═════════════ */

export function BuildingDetail({ picked }: { picked: Record<string, unknown> | null }) {
  const raw = picked?.[F.progress];
  // ⚠️ `-1` = гүйцэтгэл бүртгэгдээгүй. Зөвхөн `null`-ыг шалгавал самбар дээр
  //    «−1.0%» гэсэн утгагүй тоо гарна.
  const missing = raw == null || Number(raw) === STAGE_NA;

  if (!picked || missing) {
    return (
      <Section>
        <Empty
          label={
            picked
              ? 'Энэ блокт гүйцэтгэлийн мэдээлэл бүртгэгдээгүй байна.'
              : 'Газрын зураг дээр барилга дээр дарж тухайн блокийн мэдээллийг харна уу. Бүх блокийн нэгдсэн үзүүлэлт баруун талд байна.'
          }
        />
      </Section>
    );
  }

  const progress = Number(raw);
  const level = PROGRESS_LEVELS.find((l) => progress >= l.min && progress < l.max);

  // Тухайн блокт ТӨЛӨВЛӨГДСӨН үе шатууд (утга -1 биш)
  const stages = BUILDING_STAGES.map((st) => ({
    ...st,
    value: Number(picked[st.field] ?? STAGE_NA),
  })).filter((st) => st.value > STAGE_NA);

  const skipped = BUILDING_STAGES.length - stages.length;

  return (
    <>
      <Section title="Сонгосон блок">
        <Rows
          items={[
            { key: 'Багц', value: text(picked[F.bagts]) },
            { key: 'Блокийн дугаар', value: text(picked[F.block]) },
            { key: 'Барилгын төрөл', value: text(picked[F.type]) },
            { key: 'Гүйцэтгэгч компани', value: text(picked[F.contractor]) },
            { key: 'Айлын тоо', value: <span className="num">{num(Number(picked[F.households] ?? 0))}</span> },
            { key: 'Давхарын тоо', value: <span className="num">{num(Number(picked[F.floors] ?? 0))}</span> },
            { key: 'Ашиглалтад орох огноо', value: date(picked[F.dueDate] as string) },
          ]}
        />
      </Section>

      <Section title="Гүйцэтгэл">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Ring value={progress} color={level?.color ?? HUE} size={86} />
          <div>
            {level && <Chip color={level.color}>{level.label}</Chip>}
            <p style={{ marginTop: 8, fontSize: '0.73rem', lineHeight: 1.5, color: 'var(--ink-3)' }}>
              Энэ блокийн нийт гүйцэтгэл <b style={{ color: 'var(--ink)' }}>{pct(progress)}</b>. Доорх
              үе шатуудын жинлэсэн нийлбэрээс бүрдэнэ.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Ажлын үе шат"
        note={skipped > 0 ? `${skipped} ажил төлөвлөгдөөгүй` : `${stages.length} ажил`}
      >
        {stages.length === 0 ? (
          <Empty label="Энэ блокт үе шатын мэдээлэл бүртгэгдээгүй." />
        ) : (
          <>
            <Bars
              color={HUE}
              max={100}
              items={stages.map((st) => ({
                key: st.field,
                label: st.label,
                value: st.value,
                display: pct(st.value, 0),
              }))}
            />
            {skipped > 0 && (
              <p style={{ marginTop: 12, fontSize: '0.71rem', lineHeight: 1.5, color: 'var(--ink-3)' }}>
                Үлдсэн {skipped} ажил (утга −1) энэ блокт төлөвлөгдөөгүй тул харуулаагүй.
              </p>
            )}
          </>
        )}
      </Section>
    </>
  );
}
