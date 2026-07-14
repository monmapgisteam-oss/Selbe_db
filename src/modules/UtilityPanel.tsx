'use client';

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { Section, Stats, Stat, Bars, Data, Rows } from '@/components/ui';
import { useAsync } from '@/lib/useAsync';
import { queryStats, count, sum } from '@/lib/query';
import { UTILITY, MODULES, type UtilKey } from '@/lib/services';
import { num, km, ha } from '@/lib/format';
import s from './utility.module.css';

const HUE = MODULES.find((m) => m.key === 'utility')!.hue;
const KEYS = Object.keys(UTILITY) as UtilKey[];

/**
 * Шугам сүлжээ ба зам — Road_shugam_suljee.
 *
 * Энэ бол CAD-аас экспортолсон давхарга: атрибут нь зөвхөн CAD мета (Layer, Color,
 * Linetype…) бөгөөд материал, голч, төлөв гэх мэт актив менежментийн талбар БАЙХГҮЙ.
 * Тиймээс уртаас өөр найдвартай үзүүлэлт гаргах боломжгүй — байхгүй зүйлийг зохиохгүй.
 */
function useUtility() {
  return useAsync(async () => {
    const rows = await Promise.all(
      KEYS.map(async (k) => {
        const u = UTILITY[k];
        const st = await queryStats(u.url, [
          count('OBJECTID', 'n'),
          sum('Shape__Length', 'len'),
          ...(u.kind === 'area' ? [sum('Shape__Area', 'area')] : []),
        ]);
        return {
          key: k,
          title: u.title,
          hue: u.hue,
          kind: u.kind,
          n: Number(st.n ?? 0),
          lengthM: Number(st.len ?? 0),
          areaM2: Number(st.area ?? 0),
        };
      }),
    );
    const lines = rows.filter((r) => r.kind === 'line');
    return {
      rows,
      lines,
      totalKm: lines.reduce((a, b) => a + b.lengthM, 0) / 1000,
      totalSegments: lines.reduce((a, b) => a + b.n, 0),
      road: rows.find((r) => r.kind === 'area'),
    };
  }, []);
}

export function UtilityPanel({
  sublayers,
  setSublayers,
}: {
  sublayers: string[];
  setSublayers: Dispatch<SetStateAction<string[]>>;
}) {
  const q = useUtility();

  /**
   * Эхлэхэд бүх давхарга ил.
   *
   * ⚠️ `sublayers.length === 0` -г ИНВАРИАНТ болгож болохгүй: хэрэглэгч сүүлчийн
   * давхаргыг унтраахад массив хоосорч, эффект нь бүгдийг нь буцааж асаадаг байв.
   * Тиймээс зөвхөн НЭГ УДАА үр болгож тавина.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (sublayers.length === 0) setSublayers([...KEYS]);
  }, [sublayers.length, setSublayers]);

  const toggle = (k: UtilKey) => {
    // Функциональ шинэчлэлт — дараалсан даралт бие биенээ дарж бичихгүй
    setSublayers((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  return (
    <Data q={q}>
      {(d) => (
        <>
          <Section>
            <Stats cols={2}>
              <Stat value={num(d.totalKm, 1)} unit="км" label="Инженерийн шугамын нийт урт" color={HUE} accent />
              <Stat value={num(d.totalSegments)} label="Шугамын хэрчим" color={HUE} />
            </Stats>
            {d.road && d.road.areaM2 > 0 && (
              <div style={{ marginTop: 10 }}>
                <Stats cols={2}>
                  <Stat value={ha(d.road.areaM2, 2)} unit="га" label="Замын планы талбай" color={d.road.hue} />
                  <Stat value={num(d.road.n)} label="Замын объект" color={d.road.hue} />
                </Stats>
              </div>
            )}
          </Section>

          <Section title="Давхарга" note="дарж газрын зурагт нээх/хаах">
            <div className={s.toggles}>
              {d.rows.map((r) => {
                const on = sublayers.includes(r.key);
                return (
                  <button
                    key={r.key}
                    type="button"
                    aria-pressed={on}
                    className={`${s.toggle} ${on ? '' : s.toggleOff}`}
                    style={{ '--tone': r.hue } as React.CSSProperties}
                    onClick={() => toggle(r.key)}
                  >
                    <span className={`${s.swatch} ${r.kind === 'line' ? s.swatchLine : ''}`} />
                    <span className={s.toggleName}>{r.title}</span>
                    <span className={`${s.toggleVal} num`}>
                      {r.kind === 'line' ? `${km(r.lengthM, 1)} км` : `${ha(r.areaM2, 1)} га`}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Шугамын урт" note="төрлөөр">
            <Bars
              items={d.lines.map((r) => ({
                key: r.key,
                label: r.title,
                value: r.lengthM,
                display: `${km(r.lengthM, 2)} км`,
                color: r.hue,
              }))}
            />
          </Section>

          <Section title="Хэрчмийн тоо">
            <Rows
              items={d.rows.map((r) => ({
                key: r.title,
                value: <span className="num">{num(r.n)}</span>,
              }))}
            />
          </Section>

          <Section>
            <p className={s.note}>
              Энэ давхаргууд нь CAD зургаас экспортлогдсон тул зөвхөн геометр (урт, талбай) агуулна.
              Материал, голч, техникийн төлөв зэрэг актив менежментийн талбар байхгүй.
            </p>
          </Section>
        </>
      )}
    </Data>
  );
}
