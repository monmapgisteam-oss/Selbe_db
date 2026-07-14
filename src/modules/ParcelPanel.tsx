'use client';

import { useState } from 'react';
import { Section, Stats, Stat, Bars, Stack, Rows, List, ListItem, Data, Chip, Empty } from '@/components/ui';
import { useMap } from '@/components/MapCanvas';
import { useAsync } from '@/lib/useAsync';
import { queryGroup, queryStats, queryFeatures, count, sum, groups, groupWhere, type Group } from '@/lib/query';
import { PARCEL, PARCEL_STATUS, PARCEL_STATUS_EMPTY, MODULES } from '@/lib/services';
import { num, ha, text } from '@/lib/format';

const HUE = MODULES.find((m) => m.key === 'parcel')!.hue;
const F = PARCEL.fields;

const statusColor = (label: string) => PARCEL_STATUS[label] ?? '#94a3b8';

/**
 * Үлдсэн нэгж талбар — газар чөлөөлөлтийн явц.
 *
 * `явцын_мэдээ` талбар нь чөлөөлөлтийн бодит төлөв: зөвшилцөх, үлдэх саналтай,
 * АТД, гэрээлсэн, маргаантай, үнийн дүн зөвшөөрөөгүй. Бичлэгийн ихэнх нь хоосон
 * (хараахан ажиллаж эхлээгүй) — түүнийг "Бүртгэгдээгүй" гэж тусад нь харуулна.
 *
 * ⚠️ `rigth_type` талбарт "өмчлөх" (жижиг) ба "Эзэмших" (том) хоёр бичиглэл зэрэг
 * байдаг. Тиймээс утгыг хэвээр нь авч, өөрсдөө жижиг/том болгож хувиргахгүй.
 */
function useParcels() {
  return useAsync(async () => {
    const [totals, byStatus, byRight, byUse] = await Promise.all([
      queryStats(PARCEL.url, [count(PARCEL.oid, 'n'), sum(F.area, 'm2')]),
      queryGroup(PARCEL.url, F.status, [count(PARCEL.oid, 'n'), sum(F.area, 'm2')]),
      queryGroup(PARCEL.url, F.right, [count(PARCEL.oid, 'n'), sum(F.area, 'm2')]),
      queryGroup(PARCEL.url, F.landuse, [count(PARCEL.oid, 'n'), sum(F.area, 'm2')]),
    ]);

    const statuses = groups(byStatus, F.status, PARCEL_STATUS_EMPTY, ['n', 'm2']);

    return {
      total: Number(totals.n ?? 0),
      area: Number(totals.m2 ?? 0),
      statuses,
      /** Ажил эхэлсэн (явцын мэдээ бүхий) талбарууд */
      inProgress: statuses.filter((g) => !g.blank).reduce((a, g) => a + g.values.n, 0),
      rights: groups(byRight, F.right, 'Бүртгэгдээгүй', ['n', 'm2']),
      uses: groups(byUse, F.landuse, 'Бүртгэгдээгүй', ['n', 'm2']),
    };
  }, []);
}

/** Тухайн төлөвт хамаарах талбаруудын жагсаалт */
function useParcelList(group: Group | null) {
  return useAsync(async () => {
    if (!group) return [];
    return queryFeatures(PARCEL.url, {
      // Баганад тоологдсонтой ЯГ ижил олонлог — groupWhere нь бүх түүхий хувилбарыг хамруулна
      where: groupWhere(F.status, group),
      outFields: [PARCEL.oid, F.owner, F.address, F.area, F.right, F.status, F.note],
      orderBy: `${F.area} DESC`,
      limit: 60,
    });
  }, [group?.label ?? null]);
}

export function ParcelPanel({ picked }: { picked: Record<string, unknown> | null }) {
  const q = useParcels();
  const { setHighlight } = useMap();
  const [status, setStatus] = useState<string | null>(null);

  const selected =
    q.state === 'ready' && status ? (q.data.statuses.find((g) => g.label === status) ?? null) : null;
  const list = useParcelList(selected);

  const select = (key: string) => {
    if (q.state !== 'ready') return;
    const next = status === key ? null : key;
    setStatus(next);
    const g = next ? q.data.statuses.find((x) => x.label === next) : null;
    setHighlight(g ? groupWhere(F.status, g) : null);
  };

  return (
    <Data q={q}>
      {(d) => (
        <>
          <Section>
            <Stats cols={3}>
              <Stat value={num(d.total)} label="Үлдсэн нэгж талбар" color={HUE} accent />
              <Stat value={ha(d.area, 2)} unit="га" label="Нийт талбай" color={HUE} />
              <Stat value={num(d.inProgress)} label="Ажил эхэлсэн" color="var(--good)" />
            </Stats>
          </Section>

          <Section title="Чөлөөлөлтийн явц" note="дарж газрын зурагт шүүнэ">
            <Stack
              total={d.total}
              items={d.statuses.map((st) => ({
                key: st.label,
                label: st.label,
                value: st.values.n,
                color: statusColor(st.label),
              }))}
            />
            <div style={{ marginTop: 14 }}>
              <Bars
                max={Math.max(1, ...d.statuses.map((st) => st.values.n))}
                selected={status}
                onSelect={select}
                items={d.statuses.map((st) => ({
                  key: st.label,
                  label: st.label,
                  value: st.values.n,
                  display: `${num(st.values.n)} · ${ha(st.values.m2, 2)} га`,
                  color: statusColor(st.label),
                }))}
              />
            </div>
          </Section>

          {status && (
            <Section title={`«${status}» — талбарууд`} note="талбайгаар эрэмбэлэв">
              <Data q={list} loading="Талбарууд татаж байна…">
                {(rows) =>
                  rows.length === 0 ? (
                    <Empty label="Энэ төлөвт талбар олдсонгүй." />
                  ) : (
                    <List>
                      {rows.map((r) => (
                        <ListItem
                          key={String(r[PARCEL.oid])}
                          color={statusColor(status)}
                          title={text(r[F.owner], 'Эзэмшигч бүртгэгдээгүй')}
                          sub={text(r[F.address], 'Хаяггүй')}
                          value={`${num(Number(r[F.area] ?? 0))} м²`}
                        />
                      ))}
                    </List>
                  )
                }
              </Data>
            </Section>
          )}

          <Section title="Эрхийн төрөл">
            <Rows
              items={d.rights.map((r) => ({
                key: r.label,
                value: (
                  <span className="num">
                    {num(r.values.n)} · {ha(r.values.m2, 2)} га
                  </span>
                ),
              }))}
            />
          </Section>

          <Section title="Газрын зориулалт">
            <Rows
              items={d.uses.map((r) => ({
                key: r.label,
                value: (
                  <span className="num">
                    {num(r.values.n)} · {ha(r.values.m2, 2)} га
                  </span>
                ),
              }))}
            />
          </Section>

          {picked && <PickedParcel attrs={picked} />}
        </>
      )}
    </Data>
  );
}

function PickedParcel({ attrs }: { attrs: Record<string, unknown> }) {
  const st = text(attrs[F.status], PARCEL_STATUS_EMPTY);

  return (
    <Section title="Сонгосон нэгж талбар">
      <Rows
        items={[
          { key: 'Эзэмшигч', value: text(attrs[F.owner], 'Бүртгэгдээгүй') },
          { key: 'Хаяг', value: text(attrs[F.address], 'Бүртгэгдээгүй') },
          { key: 'Нэгж талбарын дугаар', value: text(attrs[F.parcelNo]) },
          { key: 'Талбай', value: <span className="num">{num(Number(attrs[F.area] ?? 0))} м²</span> },
          { key: 'Эрхийн төрөл', value: text(attrs[F.right], 'Бүртгэгдээгүй') },
          { key: 'Зориулалт', value: text(attrs[F.landuse], 'Бүртгэгдээгүй') },
          { key: 'Явцын мэдээ', value: <Chip color={statusColor(st)}>{st}</Chip> },
          { key: 'Тайлбар', value: text(attrs[F.note], '—') },
        ]}
      />
    </Section>
  );
}
