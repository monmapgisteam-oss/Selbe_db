'use client';

import { useState } from 'react';
import { Section, Stats, Stat, Bars, Rows, Ring, Data, Chip } from '@/components/ui';
import { useMap } from '@/components/MapCanvas';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures, groups, groupWhere, type Row } from '@/lib/query';
import { ZONE, MODULES } from '@/lib/services';
import { num, pct, mnt, mntShort, text, blank } from '@/lib/format';
import s from './zone.module.css';

const HUE = MODULES.find((m) => m.key === 'zone')!.hue;
const F = ZONE.fields;

/**
 * Бүсчлэл — хот төлөвлөлтийн бүсүүд.
 *
 * ⚠️ ЭНЭ ДАВХАРГА ДАВХАРДСАН ПОЛИГОНТОЙ.
 * 84 полигоны 20 нь ижил `ZONE_ID`-тай бөгөөд атрибут нь ЯГ ИЖИЛ (жишээ: D-11.1
 * хоёр удаа, X-13 долоон удаа бүртгэгдсэн). Тиймээс `SUM()`-аар агрегац хийвэл
 * тоо хийсвэрждэг:
 *
 *   төлөвлөсөн айл   13,655 → 7,481   (+82%)
 *   нийт талбай      175.85 → 105.05 га
 *   зогсоолын норм   38,283 → 26,070
 *
 * Тиймээс `outStatistics` ОГТ ашиглахгүй — бүх мөрийг татаж, `ZONE_ID`-аар
 * дедупликац хийж, клиент талд нэгтгэнэ. Бүс нь ердөө 84 мөр тул энэ нь хямд.
 */
type Zone = {
  id: string;
  type: string;
  households: number;
  landHa: number;
  builtM2: number;
  parkNorm: number;
  parkOpen: number;
  parkUnder: number;
  parkTotal: number;
  budget: number;
  done: number;
  left: number;
  contractor: string;
  year: string;
};

const toZone = (r: Row): Zone => ({
  id: text(r[F.id], ''),
  type: text(r[F.type], ''),
  households: Number(r[F.households] ?? 0),
  landHa: Number(r[F.landHa] ?? 0),
  builtM2: Number(r[F.builtM2] ?? 0),
  parkNorm: Number(r[F.parkNorm] ?? 0),
  parkOpen: Number(r[F.parkOpen] ?? 0),
  parkUnder: Number(r[F.parkUnder] ?? 0),
  parkTotal: Number(r[F.parkTotal] ?? 0),
  budget: Number(r[F.budget] ?? 0),
  done: Number(r[F.done2025] ?? 0),
  left: Number(r[F.left2026] ?? 0),
  contractor: text(r[F.contractor], 'Тодорхойгүй'),
  year: text(r[F.contractYear], '—'),
});

function useZones() {
  return useAsync(async () => {
    const rows = await queryFeatures(ZONE.url, {
      outFields: [
        F.id, F.type, F.households, F.landHa, F.builtM2,
        F.parkNorm, F.parkOpen, F.parkUnder, F.parkTotal,
        F.budget, F.done2025, F.left2026, F.contractor, F.contractYear,
      ],
    });

    const all = rows.map(toZone);

    // Дедупликац: ижил ZONE_ID-тай полигонуудаас НЭГИЙГ л авна.
    // ZONE_ID хоосон бүсийг тус тусад нь үлдээнэ (нэгтгэх түлхүүр байхгүй).
    const seen = new Set<string>();
    const zones: Zone[] = [];
    for (const z of all) {
      if (blank(z.id)) {
        zones.push(z);
        continue;
      }
      if (seen.has(z.id)) continue;
      seen.add(z.id);
      zones.push(z);
    }

    const S = (f: (z: Zone) => number) => zones.reduce((a, z) => a + f(z), 0);

    const parkNorm = S((z) => z.parkNorm);
    const parkTotal = S((z) => z.parkTotal);
    const landHa = S((z) => z.landHa);
    const builtM2 = S((z) => z.builtM2);

    // Төсөвтэй багцууд (дедупликацтай жагсаалтаас)
    const pkgs = zones.filter((z) => z.budget > 0).sort((a, b) => b.budget - a.budget);

    // Зориулалтаар — мөн дедупликацтай жагсаалтаас
    const byType = groups(
      zones.map((z) => ({ [F.type]: z.type, ga: z.landHa, n: 1 })) as Row[],
      F.type,
      'Бүртгэгдээгүй',
      ['ga', 'n'],
    );

    return {
      /** Газрын зурагт байгаа полигоны тоо */
      polygons: all.length,
      /** Давхардлыг хассан бодит бүсийн тоо */
      zones: zones.length,
      duplicates: all.length - zones.length,

      landHa,
      builtM2,
      households: S((z) => z.households),
      density: landHa > 0 ? builtM2 / (landHa * 10_000) : null,

      parkNorm,
      parkTotal,
      parkOpen: S((z) => z.parkOpen),
      parkUnder: S((z) => z.parkUnder),
      parkCoverage: parkNorm > 0 ? (parkTotal / parkNorm) * 100 : null,

      pkgs,
      budget: pkgs.reduce((a, b) => a + b.budget, 0),
      done: pkgs.reduce((a, b) => a + b.done, 0),
      noBudget: zones.length - pkgs.length,

      byType: byType.filter((t) => !t.blank),
    };
  }, []);
}

export function ZonePanel({ picked }: { picked: Record<string, unknown> | null }) {
  const q = useZones();
  const { setHighlight } = useMap();
  const [sel, setSel] = useState<string | null>(null);

  return (
    <Data q={q}>
      {(d) => (
        <>
          <Section>
            <Stats cols={3}>
              <Stat value={num(d.zones)} label="Бүсийн тоо" color={HUE} accent />
              <Stat value={num(d.landHa, 1)} unit="га" label="Нийт талбай" color={HUE} />
              <Stat value={num(d.households)} label="Төлөвлөсөн айл" color={HUE} />
            </Stats>
            <div style={{ marginTop: 10 }}>
              <Stats cols={2}>
                <Stat value={num(d.builtM2 / 1000, 0)} unit="мянган м²" label="Барилгын талбай" color={HUE} />
                <Stat
                  value={num(d.density, 2)}
                  label="Дундаж нягтрал (барилга м² / газар м²)"
                  color={HUE}
                />
              </Stats>
            </div>

            {d.duplicates > 0 && (
              <p className={s.dup}>
                Давхаргад <b>{num(d.polygons)}</b> полигон байгаагаас <b>{num(d.duplicates)}</b> нь
                ижил бүсийн давхардсан хуулбар (ижил <code>ZONE_ID</code>, ижил атрибут). Дээрх бүх
                тоо давхардлыг хасаж, <b>{num(d.zones)}</b> бодит бүсээр тооцов.
              </p>
            )}
          </Section>

          <Section title="Авто зогсоол" note="норм ба төлөвлөсөн">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Ring
                value={d.parkCoverage}
                color={d.parkCoverage != null && d.parkCoverage < 50 ? 'var(--bad)' : HUE}
                size={92}
                label="хүртээмж"
              />
              <div style={{ flex: 1 }}>
                <Rows
                  items={[
                    { key: 'Шаардлагатай (норм)', value: <span className="num">{num(d.parkNorm)}</span> },
                    { key: 'Төлөвлөсөн — нийт', value: <span className="num">{num(d.parkTotal)}</span> },
                    { key: '· ил зогсоол', value: <span className="num">{num(d.parkOpen)}</span> },
                    { key: '· далд зогсоол', value: <span className="num">{num(d.parkUnder)}</span> },
                    {
                      key: 'Дутагдал',
                      value: (
                        <span className="num" style={{ color: 'var(--bad)' }}>
                          {num(Math.max(0, d.parkNorm - d.parkTotal))}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          </Section>

          <Section title="Төсөв ба гүйцэтгэл" note={`${num(d.pkgs.length)} багцад бүртгэгдсэн`}>
            <Stats cols={2}>
              <Stat value={mnt(d.budget)} label="Нийт төсөв" color={HUE} accent />
              <Stat value={mnt(d.done)} label="2025 оны гүйцэтгэл" color="var(--good)" accent />
            </Stats>

            <div style={{ marginTop: 14 }}>
              <Bars
                color={HUE}
                max={100}
                items={d.pkgs.map((p) => ({
                  key: p.id,
                  label: `${p.id} — ${mntShort(p.budget)}`,
                  value: (p.done / p.budget) * 100,
                  display: pct((p.done / p.budget) * 100),
                }))}
              />
            </div>

            <div style={{ marginTop: 14 }}>
              {d.pkgs.map((p) => (
                <div key={p.id} style={{ marginBottom: 12 }}>
                  <Rows
                    items={[
                      { key: 'Багц', value: <><b>{p.id}</b> <Chip color={HUE}>{p.year}</Chip></> },
                      { key: 'Гүйцэтгэгч', value: p.contractor },
                      { key: 'Айл', value: <span className="num">{num(p.households)}</span> },
                      { key: '2026 эхний үлдэгдэл', value: <span className="num">{mnt(p.left)}</span> },
                    ]}
                  />
                </div>
              ))}
            </div>

            <p className={s.note}>
              Үлдсэн {num(d.noBudget)} бүсийн төсөв үйлчилгээнд бүртгэгдээгүй (утга 0) тул нийт дүнд
              оруулаагүй.
            </p>
          </Section>

          <Section title="Бүсийн зориулалт" note="газрын талбайгаар · дарж тодруулна">
            <Bars
              color={HUE}
              selected={sel}
              onSelect={(key) => {
                const g = d.byType.find((t) => t.label === key);
                const next = sel === key ? null : key;
                setSel(next);
                setHighlight(next && g ? groupWhere(F.type, g) : null);
              }}
              items={d.byType.map((t) => ({
                key: t.label,
                label: `${t.label} · ${num(t.values.n)} бүс`,
                value: t.values.ga,
                display: `${num(t.values.ga, 2)} га`,
              }))}
            />
          </Section>

          {picked && <PickedZone attrs={picked} />}
        </>
      )}
    </Data>
  );
}

function PickedZone({ attrs }: { attrs: Record<string, unknown> }) {
  const z = toZone(attrs as Row);
  const coverage = z.parkNorm > 0 ? (z.parkTotal / z.parkNorm) * 100 : null;

  return (
    <Section title="Сонгосон бүс">
      <Rows
        items={[
          { key: 'Бүсийн код', value: z.id || '—' },
          { key: 'Зориулалт', value: z.type || 'Тодорхойгүй' },
          { key: 'Газрын талбай', value: <span className="num">{num(z.landHa, 3)} га</span> },
          { key: 'Барилгын талбай', value: <span className="num">{num(z.builtM2)} м²</span> },
          { key: 'Айлын тоо', value: <span className="num">{num(z.households)}</span> },
          { key: 'FAR (ашиглалтын коэф.)', value: <span className="num">{num(Number(attrs[F.far] ?? 0), 4)}</span> },
          { key: 'BCR (барилгажилт)', value: <span className="num">{num(Number(attrs[F.bcr] ?? 0), 4)}</span> },
          { key: 'Зогсоолын норм', value: <span className="num">{num(z.parkNorm)}</span> },
          { key: 'Төлөвлөсөн зогсоол', value: <span className="num">{num(z.parkTotal)}</span> },
          { key: 'Хүртээмж', value: <span className="num">{pct(coverage)}</span> },
          ...(z.budget > 0
            ? [
                { key: 'Төсөв', value: <span className="num">{mnt(z.budget)}</span> },
                { key: 'Гүйцэтгэгч', value: z.contractor },
              ]
            : []),
        ]}
      />
    </Section>
  );
}
