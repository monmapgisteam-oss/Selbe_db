'use client';

import { useState } from 'react';
import { Section, Stats, Stat, Bars, Ring, Rows, Data, Empty } from '@/components/ui';
import { useMap } from '@/components/MapCanvas';
import { useAsync } from '@/lib/useAsync';
import { queryGroup, queryStats, count, sum, avg, sqlStr, groups } from '@/lib/query';
import { BAGTS, BUILDING, STAGE_NA, MODULES } from '@/lib/services';
import { num, pct, ha, text } from '@/lib/format';

const HUE = MODULES.find((m) => m.key === 'bagts')!.hue;

/**
 * Багцын хил — төслийн үндсэн хүрээ.
 *
 * Хилийн давхаргад зөвхөн нэр (`BAGTS`) ба талбай байдаг. Явцыг харуулахын тулд
 * барилгын явцын давхаргыг мөн `BAGTS` талбараар бүлэглэж холбоно — хоёр давхарга
 * ижил нэршил хэрэглэдэг ("Багц 1", "Багц 3.2"…).
 */
const B = BUILDING.fields;

/** Гүйцэтгэл бүртгэгдсэн (-1 биш) блокууд — ЗӨВХӨН дунджид хэрэглэнэ */
const HAS_PROGRESS = `${B.progress} >= ${STAGE_NA + 1}`;

function useBagts() {
  return useAsync(async () => {
    const [areas, countsAll, avgByBagts, totalsAll, totalsAvg] = await Promise.all([
      queryGroup(BAGTS.url, BAGTS.fields.name, [count(BAGTS.oid, 'n'), sum(BAGTS.fields.area, 'm2')]),

      // ⚠️ Блок ба айлын ТОО нь бүх бичлэгээс. Гүйцэтгэлийн шүүлтийг энд ХИЙХГҮЙ —
      //    эс бөгөөс гүйцэтгэл бүртгэгдээгүй блокууд тооллогоос чимээгүй унана.
      queryGroup(BUILDING.url, B.bagts, [count(BUILDING.oid, 'blocks'), sum(B.households, 'ail')]),
      // Дундаж гүйцэтгэлд л -1-ийг хасна
      queryGroup(BUILDING.url, B.bagts, [avg(B.progress, 'g')], HAS_PROGRESS),

      queryStats(BUILDING.url, [count(BUILDING.oid, 'blocks'), sum(B.households, 'ail')]),
      queryStats(BUILDING.url, [avg(B.progress, 'g')], HAS_PROGRESS),
    ]);

    // ArcGIS нь null ба ' ' -г тусад нь бүлэглэдэг — groups() нэгтгэж, ХУРААНА
    const areaG = groups(areas, BAGTS.fields.name, 'Нэргүй', ['m2', 'n']);
    const countG = groups(countsAll, B.bagts, 'Нэргүй', ['blocks', 'ail']);
    const avgG = groups(avgByBagts, B.bagts, 'Нэргүй', ['g']);

    const names = new Set([...areaG, ...countG].map((g) => g.label));

    const rows = [...names]
      .map((name) => ({
        name,
        m2: areaG.find((g) => g.label === name)?.values.m2 ?? 0,
        blocks: countG.find((g) => g.label === name)?.values.blocks ?? 0,
        ail: countG.find((g) => g.label === name)?.values.ail ?? 0,
        progress: avgG.find((g) => g.label === name)?.values.g ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'mn'));

    return {
      rows,
      totalM2: rows.reduce((a, b) => a + b.m2, 0),
      /** Хил нь зураглагдаагүй боловч барилга нь бүртгэлтэй багцууд */
      unmapped: rows.filter((r) => r.m2 === 0 && r.blocks > 0).map((r) => r.name),
      blocks: Number(totalsAll.blocks ?? 0),
      households: Number(totalsAll.ail ?? 0),
      progress: totalsAvg.g == null ? null : Number(totalsAvg.g),
    };
  }, []);
}

export function BagtsPanel({ picked }: { picked: Record<string, unknown> | null }) {
  const q = useBagts();
  const { setHighlight } = useMap();
  const [sel, setSel] = useState<string | null>(null);

  const select = (name: string) => {
    const next = sel === name ? null : name;
    setSel(next);
    setHighlight(next ? `${BAGTS.fields.name} = ${sqlStr(next)}` : null);
  };

  const pickedName = picked ? text(picked[BAGTS.fields.name], '') : '';

  return (
    <Data q={q}>
      {(d) => (
        <>
          <Section>
            <Stats cols={3}>
              <Stat value={ha(d.totalM2, 1)} unit="га" label="Багцын хилийн талбай" color={HUE} accent />
              <Stat value={num(d.blocks)} label="Барилгын блок" color={HUE} />
              <Stat value={num(d.households)} label="Айлын тоо" color={HUE} />
            </Stats>
          </Section>

          <Section title="Нийт явц" note="барилгын блокуудын дундаж">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Ring value={d.progress} color={HUE} size={100} label="гүйцэтгэл" />
              <p style={{ fontSize: '0.76rem', color: 'var(--ink-3)', lineHeight: 1.55 }}>
                {num(d.blocks)} блокийн <b style={{ color: 'var(--ink)' }}>{pct(d.progress)}</b> нийт
                гүйцэтгэл. Тухайн ажил төлөвлөгдөөгүй блокуудыг (утга −1) тооцооноос хассан.
              </p>
            </div>
          </Section>

          <Section title="Багц тус бүрээр" note="дарж газрын зурагт тодруулна">
            <Bars
              color={HUE}
              max={100}
              selected={sel}
              onSelect={select}
              items={d.rows.map((r) => ({
                key: r.name,
                label: r.name,
                value: r.progress ?? 0,
                display: r.progress == null ? 'мэдээлэлгүй' : pct(r.progress),
              }))}
            />
          </Section>

          <Section
            title="Багцын хэмжээ"
            note={d.unmapped.length ? `${d.unmapped.length} багцын хил зураглагдаагүй` : undefined}
          >
            <Rows
              items={d.rows.map((r) => ({
                key: r.name,
                value: (
                  <span className="num">
                    {r.m2 === 0 ? 'хилгүй' : `${ha(r.m2, 2)} га`} · {num(r.blocks)} блок ·{' '}
                    {num(r.ail)} айл
                  </span>
                ),
              }))}
            />
            {d.unmapped.length > 0 && (
              <p style={{ marginTop: 12, fontSize: '0.72rem', color: 'var(--ink-3)', lineHeight: 1.55 }}>
                {d.unmapped.join(', ')} багцын барилгууд бүртгэлтэй ч <code>bagts_hil</code> давхаргад
                тэдгээрийн хил зурагдаагүй байна. Тиймээс хилийн нийт талбай ({ha(d.totalM2, 1)} га) нь
                төслийн бүх талбайг хамрахгүй.
              </p>
            )}
          </Section>

          {picked && pickedName && (
            <Section title="Сонгосон багц">
              <Rows
                items={[
                  { key: 'Багц', value: pickedName },
                  { key: 'Талбай', value: `${ha(Number(picked[BAGTS.fields.area] ?? 0), 2)} га` },
                ]}
              />
            </Section>
          )}

          {picked && !pickedName && (
            <Section>
              <Empty label="Сонгосон объектод багцын нэр байхгүй." />
            </Section>
          )}
        </>
      )}
    </Data>
  );
}
