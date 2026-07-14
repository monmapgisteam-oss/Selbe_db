'use client';

import { useEffect, useState } from 'react';
import { Section, Stats, Stat, Bars, Rows, Ring, Data, Empty, List, ListItem, Chip } from '@/components/ui';
import { useMap } from '@/components/MapCanvas';
import { useAsync } from '@/lib/useAsync';
import {
  queryFeatures, queryStats, queryPolygon, queryPoints,
  count, sum, avg, type Row, type Point,
} from '@/lib/query';
import { SURVEY, SURVEY_SECTIONS, BOUNDARY, MODULES } from '@/lib/services';
import { num, pct, date, text, blank } from '@/lib/format';
import s from './survey.module.css';

const HUE = MODULES.find((m) => m.key === 'survey')!.hue;
const F = SURVEY.fields;

/** Асуудлын нөлөөллийн зэрэг — мобайл апп латинаар бичдэг */
const IMPACT: Record<string, { label: string; color: string }> = {
  bag: { label: 'Бага', color: 'var(--good)' },
  dund: { label: 'Дунд', color: 'var(--warn)' },
  undur: { label: 'Өндөр', color: 'var(--bad)' },
};

/**
 * Талбайн хяналт — Survey123 мобайл аппаас ирсэн тайлан.
 *
 * Хяналтын ажилтан талбар дээр маягт бөглөхөд шинэ бичлэг үүсдэг. Тайлан бүр
 * барилга, гүйцэтгэгч, хүн хүч, техник, 16 хэсгийн гүйцэтгэлийг агуулна. Асуудлууд
 * `r_asuudal` хүснэгтэд `parentglobalid`-аар холбогдоно.
 */
function useSurvey() {
  return useAsync(async () => {
    const [reports, totals, issues] = await Promise.all([
      queryFeatures(SURVEY.url, { orderBy: `${F.created} DESC`, limit: 100 }),
      queryStats(SURVEY.url, [
        count(SURVEY.oid, 'n'),
        sum(F.workers, 'workers'),
        sum(F.machines, 'machines'),
        avg(F.total, 'g'),
      ]),
      queryFeatures(SURVEY.tables.asuudal, { limit: 200 }),
    ]);

    const byParent = new Map<string, Row[]>();
    for (const i of issues) {
      const p = String(i.parentglobalid ?? '');
      byParent.set(p, [...(byParent.get(p) ?? []), i]);
    }

    return {
      reports,
      issues,
      byParent,
      count: Number(totals.n ?? 0),
      workers: Number(totals.workers ?? 0),
      machines: Number(totals.machines ?? 0),
      progress: totals.g == null ? null : Number(totals.g),
    };
  }, []);
}

/* ═════════════ ЗҮҮН багана — хилээс гадуур бүртгэсэн ═════════════ */

/** Хилээс гадуур бүртгэсэн хяналтын ажилтан */
type Offender = { user: string; points: Point[] };

/**
 * Төслийн хилийн ГАДНА бичигдсэн тайлангууд.
 *
 * Хүрээ (extent) харьцуулах нь ойролцоо тэгш өнцөгт ойролцоолол болно. Тиймээс
 * төлөвлөлтийн талбайн ЖИНХЭНЭ полигоныг татаж, серверт `disjoint` харьцаагаар
 * шалгуулна — хилийн ойролцоо, гэхдээ гадна унасан цэгийг ч зөв илрүүлнэ.
 */
function useOutside() {
  return useAsync(async () => {
    const boundary = await queryPolygon(BOUNDARY.plan.url);
    if (!boundary) return { total: 0, offenders: [] as Offender[] };

    const points = await queryPoints(SURVEY.url, {
      aoi: { ...boundary, rel: 'disjoint' },
      outFields: [SURVEY.oid, 'globalid', F.user, F.contractor, F.bagts, F.building, F.date],
      orderBy: `${F.date} DESC`,
    });

    const byUser = new Map<string, Point[]>();
    for (const p of points) {
      const user = text(p.attrs[F.user], 'Тодорхойгүй');
      byUser.set(user, [...(byUser.get(user) ?? []), p]);
    }

    return {
      total: points.length,
      offenders: [...byUser.entries()]
        .map(([user, ps]) => ({ user, points: ps }))
        .sort((a, b) => b.points.length - a.points.length),
    };
  }, []);
}

export function SurveyOutside() {
  const q = useOutside();

  return (
    <Data q={q}>
      {(d) =>
        d.total === 0 ? (
          <Section>
            <Empty label="Бүх тайлан төслийн хил дотор бүртгэгдсэн байна." />
          </Section>
        ) : (
          <Section title="Хилээс гадуур бүртгэсэн" note={`${num(d.total)} тайлан`}>
            <div className={s.warn} role="note">
              Эдгээр тайлангийн байрлал төслийн хилийн ГАДНА бичигдсэн байна. Тоон үзүүлэлт нь зөв
              байж болох ч газрын зураг дээрх байршилд найдаж болохгүй — маягт бөглөх үед GPS буруу
              авагдсан байх магадлалтай.
            </div>

            <div className={s.offenders}>
              {d.offenders.map((o) => (
                <div key={o.user} className={s.offender}>
                  <div className={s.offenderHead}>
                    <span className={s.offenderName}>{o.user}</span>
                    <Chip color="var(--warn)">{num(o.points.length)} тайлан</Chip>
                  </div>

                  <ul className={s.offenderList}>
                    {o.points.map((p) => (
                      <li key={String(p.attrs[SURVEY.oid])} className={s.offenderRow}>
                        <span className={s.offenderBuilding}>
                          {text(p.attrs[F.building], 'Барилга тодорхойгүй')}
                        </span>
                        <span className={s.offenderMeta}>
                          {date(p.attrs[F.date] as string)} · {text(p.attrs[F.contractor])}
                        </span>
                        <span className={`${s.offenderCoord} num`}>
                          {p.lat.toFixed(5)}, {p.lon.toFixed(5)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        )
      }
    </Data>
  );
}

export function SurveyPanel({ picked }: { picked: Record<string, unknown> | null }) {
  const q = useSurvey();
  const { zoomToLayer } = useMap();
  const [selId, setSelId] = useState<string | null>(null);

  /**
   * Тайлангийн цэг БА төслийн хилийг хоёуланг нь багтаах хүрээ рүү аваачна.
   *
   * Одоогийн тайлангууд төслийн хилээс гадуур бичигдсэн байгаа. Зөвхөн цэг рүү
   * ойртвол хил, багц, барилга нь харагдацаас гадуур үлдэж, зөрүү нь мэдэгдэхгүй.
   * Хоёуланг нь нэг дор харуулснаар зөрүү шууд илэрхий болно.
   */
  useEffect(() => {
    if (q.state !== 'ready' || q.data.count === 0) return;
    const t = setTimeout(() => zoomToLayer('survey', { withBoundary: true }), 250);
    return () => clearTimeout(t);
  }, [q.state, q.state === 'ready' ? q.data.count : 0, zoomToLayer]);

  return (
    <Data q={q}>
      {(d) => {
        if (d.count === 0) {
          return (
            <Section>
              <Empty label="Мобайл аппаас тайлан хараахан ирээгүй байна." />
            </Section>
          );
        }

        // Газрын зураг дээр дарсан цэг эсвэл жагсаалтаас сонгосон тайлан
        const pickedId = picked ? String(picked.globalid ?? '') : null;
        const activeId = pickedId || selId;
        const active = d.reports.find((r) => String(r.globalid) === activeId) ?? d.reports[0];
        const activeIssues = d.byParent.get(String(active?.globalid ?? '')) ?? [];

        return (
          <>
            <Section>
              <Stats cols={3}>
                <Stat value={num(d.count)} label="Ирсэн тайлан" color={HUE} accent />
                <Stat value={num(d.workers)} label="Хүн хүч" color={HUE} />
                <Stat value={num(d.machines)} label="Техник" color={HUE} />
              </Stats>
            </Section>

            <Section title="Дундаж гүйцэтгэл" note="тайлангуудын дундаж">
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <Ring value={d.progress} color={HUE} size={92} label="б. угсралт" />
                <p className={s.note}>
                  Мобайл аппын маягтад бүртгэсэн «Б. Барилга угсралтын нийт гүйцэтгэл» талбарын дундаж.
                  Тайлан бүр талбар дээрээс шууд илгээгддэг.
                </p>
              </div>
            </Section>

            <Section title="Ирсэн тайлан" note={`сүүлийн ${Math.min(d.reports.length, 100)}`}>
              <List>
                {d.reports.map((r) => {
                  const id = String(r.globalid);
                  const n = (d.byParent.get(id) ?? []).length;
                  return (
                    <ListItem
                      key={id}
                      color={HUE}
                      active={id === activeId}
                      onClick={() => setSelId(id)}
                      title={text(r[F.building], 'Барилга тодорхойгүй')}
                      sub={`${date(r[F.date] as string)} · ${text(r[F.contractor])}${n ? ` · ${n} асуудал` : ''}`}
                      value={pct(Number(r[F.total] ?? 0), 0)}
                    />
                  );
                })}
              </List>
            </Section>

            {active && <ReportDetail r={active} issues={activeIssues} />}
          </>
        );
      }}
    </Data>
  );
}

function ReportDetail({ r, issues }: { r: Row; issues: Row[] }) {
  // Зөвхөн бөглөгдсөн хэсгүүд (null = тухайн ажил хараахан эхлээгүй)
  const sections = SURVEY_SECTIONS.map((sec) => ({
    ...sec,
    value: r[sec.field] == null ? null : Number(r[sec.field]),
  })).filter((sec) => sec.value != null);

  return (
    <>
      <Section title="Тайлангийн дэлгэрэнгүй">
        <Rows
          items={[
            { key: 'Огноо', value: date(r[F.date] as string) },
            { key: 'Багц', value: text(r[F.bagts]) },
            { key: 'Барилга', value: text(r[F.building]) },
            { key: 'Барилгын төрөл', value: text(r[F.buildingType]) },
            { key: 'Гүйцэтгэгч', value: text(r[F.contractor]) },
            { key: 'Хяналтын ажилтан', value: text(r[F.user]) },
            { key: 'Давхрын тоо', value: <span className="num">{num(Number(r[F.floors] ?? 0))}</span> },
            { key: 'Цутгалтын үе шат', value: <span className="num">{num(Number(r[F.pours] ?? 0))}</span> },
            { key: 'Хүн хүч', value: <span className="num">{num(Number(r[F.workers] ?? 0))}</span> },
            { key: 'Техник механизм', value: <span className="num">{num(Number(r[F.machines] ?? 0))}</span> },
            {
              key: 'Нийт гүйцэтгэл',
              value: <span className="num" style={{ color: HUE }}>{pct(Number(r[F.total] ?? 0))}</span>,
            },
            {
              key: 'Дутуу гүйцэтгэл',
              value: <span className="num" style={{ color: 'var(--bad)' }}>{pct(Number(r[F.shortfall] ?? 0))}</span>,
            },
          ]}
        />
        {!blank(r[F.note]) && <p className={s.comment}>{String(r[F.note])}</p>}
      </Section>

      <Section title="Ажлын хэсгийн гүйцэтгэл" note={`${sections.length} хэсэг бөглөгдсөн`}>
        {sections.length === 0 ? (
          <Empty label="Ажлын хэсэг хараахан бөглөгдөөгүй." />
        ) : (
          <Bars
            color={HUE}
            max={100}
            items={sections.map((sec) => ({
              key: sec.field,
              label: sec.label,
              value: sec.value ?? 0,
              display: pct(sec.value ?? 0, 1),
            }))}
          />
        )}
      </Section>

      <Section title="Илэрсэн асуудал" note={`${issues.length}`}>
        {issues.length === 0 ? (
          <Empty label="Энэ тайланд асуудал бүртгэгдээгүй." />
        ) : (
          <div className={s.issues}>
            {issues.map((i) => {
              const impact = IMPACT[String(i.asuudal_noloo ?? '')] ?? {
                label: text(i.asuudal_noloo, 'Тодорхойгүй'),
                color: 'var(--ink-3)',
              };
              return (
                <div key={String(i.objectid)} className={s.issue}>
                  <div className={s.issueHead}>
                    <span className={s.issueKind}>{text(i.asuudal_ang, 'Ангилалгүй')}</span>
                    <Chip color={impact.color}>{impact.label}</Chip>
                  </div>
                  <p className={s.issueText}>{text(i.asuudal_tailbar, 'Тайлбаргүй')}</p>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
