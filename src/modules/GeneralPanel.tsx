'use client';

import { useEffect, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { Section, Stats, Stat, Bars, Rows, Ring, Data, Empty } from '@/components/ui';
import { useMap } from '@/components/MapCanvas';
import { useAsync } from '@/lib/useAsync';
import { queryGroup, queryStats, count, sum, avg, groups, groupWhere } from '@/lib/query';
import { GENERAL, GENERAL_FIELDS as G, MODULES, type GeneralKey } from '@/lib/services';
import { num, pct, ha, km, date, text } from '@/lib/format';
import s from './general.module.css';

const HUE = MODULES.find((m) => m.key === 'general')!.hue;

const KEYS = Object.keys(GENERAL) as GeneralKey[];

const isKey = (v: string): v is GeneralKey => (KEYS as string[]).includes(v);

/** Газрын зургийн давхаргын id (`general:green`) → дэд давхаргын түлхүүр */
const keyOfLayer = (layerId: string | null): GeneralKey | null => {
  const k = layerId?.split(':')[1];
  return k && isKey(k) ? k : null;
};

/**
 * Ерөнхий мэдээлэл — Selbe_talbain_hynalt-ийн 7 давхарга.
 *
 * Давхарга бүрд `Bod_guits` (бодит гүйцэтгэл %) ба `Tol_guits` (төлөвлөсөн дуусах
 * ОГНОО) байдаг. «Төлөвлөсөн гүйцэтгэл %» гэсэн талбар үйлчилгээнд БАЙХГҮЙ тул
 * зохиомол төлөвлөгөө зурахгүй — зөвхөн бодит хувь ба зорилтот огноог харуулна.
 */
function useGeneral(key: GeneralKey) {
  return useAsync(async () => {
    const def = GENERAL[key];
    const sums = def.sums ?? [];

    const [totals, ...facets] = await Promise.all([
      queryStats(def.url, [
        count(G.oid, 'n'),
        avg(G.progress, 'g'),
        sum(G.area, 'area'),
        sum(G.length, 'len'),
        ...sums.map((x, i) => sum(x.field, `x${i}`)),
      ]),
      ...def.facets.map((f) => queryGroup(def.url, f.field, [count(G.oid, 'n'), sum(G.area, 'area')])),
    ]);

    return {
      count: Number(totals.n ?? 0),
      progress: totals.g == null ? null : Number(totals.g),
      areaM2: Number(totals.area ?? 0),
      lengthM: Number(totals.len ?? 0),
      sums: sums.map((x, i) => ({
        label: x.label,
        value: Number(totals[`x${i}`] ?? 0),
        unit: x.unit,
      })),
      // ArcGIS нь null ба ' ' -г тусад нь бүлэглэдэг тул хоосныг нэгтгэнэ
      facets: def.facets.map((f, i) => ({
        field: f.field,
        label: f.label,
        items: groups(facets[i], f.field, 'Бүртгэгдээгүй', ['n', 'area']),
      })),
    };
  }, [key]);
}

export function GeneralPanel({
  picked,
  pickedLayer,
  clearPicked,
  sublayers,
  setSublayers,
}: {
  picked: Record<string, unknown> | null;
  pickedLayer: string | null;
  clearPicked: () => void;
  sublayers: string[];
  /** Функциональ шинэчлэлт заавал дэмжинэ — дараалсан даралт бие биенээ дарж бичихгүй */
  setSublayers: Dispatch<SetStateAction<string[]>>;
}) {
  const { setHighlight } = useMap();

  /** Ил байгаа давхаргууд (олон сонголт) */
  const visible = sublayers.filter(isKey) as GeneralKey[];

  /** Дэлгэрэнгүй үзүүлэлт нь ЗӨВХӨН нэг давхаргынх — фокус */
  const [focus, setFocus] = useState<GeneralKey>('built');
  const [facet, setFacet] = useState<string | null>(null);

  // Эхлэхэд нэг давхарга ил
  useEffect(() => {
    if (sublayers.length === 0) setSublayers(['built']);
  }, [sublayers.length, setSublayers]);

  // Фокус нь ил давхаргуудын дунд байх ёстой — унтраасан бол үлдсэн рүү нь шилжинэ.
  // (`visible` нь рендер бүрд шинэ массив тул түлхүүрийг мөр болгож тогтворжуулав.)
  const visibleKey = visible.join(',');
  useEffect(() => {
    const list = visibleKey ? (visibleKey.split(',') as GeneralKey[]) : [];
    if (list.length > 0 && !list.includes(focus)) setFocus(list[0]);
  }, [visibleKey, focus]);

  // Газрын зураг дээр объект дарвал тэр давхарга руу фокусыг шилжүүлнэ
  const pickedKey = keyOfLayer(pickedLayer);
  useEffect(() => {
    if (pickedKey) setFocus(pickedKey);
  }, [pickedKey]);

  const q = useGeneral(focus);
  const def = GENERAL[focus];

  /** Давхаргыг ил/далд болгох. Сүүлчийнхийг унтраахыг зөвшөөрнө. */
  const toggle = (k: GeneralKey) => {
    // ⚠️ Функциональ шинэчлэлт: хэд хэдэн даралт нэг батчид орвол хуучин массивыг
    //    уншиж бие биенээ дарж бичихээс сэргийлнэ.
    setSublayers((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
    setFacet(null);
    setHighlight(null);
    // Сонгосон объектыг цэвэрлэнэ — эс бөгөөс өмнөх давхаргын атрибут өөр давхаргын
    // талбарын нэрсээр уншигдаж, бүх мөр «Бүртгэгдээгүй» болно.
    clearPicked();
    if (!visible.includes(k)) setFocus(k);
  };

  return (
    <>
      <Section title="Давхарга" note="олон давхаргыг зэрэг харж болно">
        <div className={s.layers}>
          {KEYS.map((k) => {
            const on = visible.includes(k);
            return (
              <button
                key={k}
                type="button"
                role="switch"
                aria-checked={on}
                className={`${s.layer} ${on ? s.layerOn : ''}`}
                style={{ '--tone': GENERAL[k].hue } as CSSProperties}
                onClick={() => toggle(k)}
              >
                <span className={s.box} aria-hidden>
                  {on && (
                    <svg viewBox="0 0 12 12" width="10" height="10">
                      <path
                        d="M2 6.2 4.6 8.8 10 3.4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className={s.name}>{GENERAL[k].title}</span>
              </button>
            );
          })}
        </div>

        {visible.length === 0 && (
          <p className={s.note}>Давхарга сонгоогүй байна — газрын зураг хоосон харагдана.</p>
        )}
      </Section>

      {visible.length > 0 && (
        <>
          <Section title="Дэлгэрэнгүй" note={visible.length > 1 ? 'аль давхаргынх' : undefined}>
            {visible.length > 1 && (
              <div className={s.tabs}>
                {visible.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={k === focus}
                    className={`${s.tab} ${k === focus ? s.tabOn : ''}`}
                    style={{ '--tone': GENERAL[k].hue } as CSSProperties}
                    onClick={() => {
                      setFocus(k);
                      setFacet(null);
                      setHighlight(null);
                    }}
                  >
                    {GENERAL[k].title}
                  </button>
                ))}
              </div>
            )}

            <Data q={q}>
              {(d) => (
                <>
                  <Stats cols={3}>
                    <Stat value={num(d.count)} label="Объектын тоо" color={def.hue} accent />
                    {d.areaM2 > 0 && (
                      <Stat value={ha(d.areaM2, 1)} unit="га" label="Талбай" color={def.hue} />
                    )}
                    {d.lengthM > 0 && (
                      <Stat value={km(d.lengthM, 1)} unit="км" label="Нийт урт" color={def.hue} />
                    )}
                  </Stats>

                  {d.sums.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <Rows
                        items={d.sums.map((x) => ({
                          key: x.label,
                          value: (
                            <span className="num">
                              {num(x.value)}
                              {x.unit ? ` ${x.unit}` : ''}
                            </span>
                          ),
                        }))}
                      />
                    </div>
                  )}
                </>
              )}
            </Data>
          </Section>

          <Data q={q}>
            {(d) => (
              <>
                <Section title="Бодит гүйцэтгэл" note="Bod_guits талбарын дундаж">
                  {d.progress == null ? (
                    <Empty label="Гүйцэтгэлийн өгөгдөл байхгүй." />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                      <Ring value={d.progress} color={def.hue} size={92} />
                      <p className={s.note}>
                        Үйлчилгээнд «төлөвлөсөн гүйцэтгэл %» гэсэн талбар байхгүй — зөвхөн бодит хувь
                        ба объект тус бүрийн зорилтот огноо (<code>Tol_guits</code>) бүртгэгддэг.
                      </p>
                    </div>
                  )}
                </Section>

                {d.facets.map((f) => (
                  <Section key={f.label} title={f.label} note="дарж газрын зурагт шүүнэ">
                    <Bars
                      color={def.hue}
                      selected={facet}
                      onSelect={(k) => {
                        const g = f.items.find((x) => `${f.label}:${x.label}` === k);
                        const next = facet === k ? null : k;
                        setFacet(next);
                        // groupWhere нь нэгтгэсэн бүх түүхий утгыг хамруулна —
                        // баганад тоологдсонтой яг ижил олонлог сонгогдоно
                        setHighlight(next && g ? groupWhere(f.field, g) : null);
                      }}
                      items={f.items.map((g) => ({
                        key: `${f.label}:${g.label}`,
                        label: g.label,
                        value: g.values.n,
                        display:
                          g.values.area > 0
                            ? `${num(g.values.n)} · ${ha(g.values.area, 1)} га`
                            : num(g.values.n),
                      }))}
                    />
                  </Section>
                ))}
              </>
            )}
          </Data>
        </>
      )}

      {picked && pickedKey && <PickedFeature attrs={picked} layer={pickedKey} />}
    </>
  );
}

/**
 * Сонгосон объект.
 *
 * ⚠️ Талбарын нэрсийг ФОКУС давхаргаас биш, объект нь ЯГ АЛЬ давхаргаас ирснээс
 * авна. Олон давхарга зэрэг ил үед энэ хоёр өөр байж болно.
 */
function PickedFeature({ attrs, layer }: { attrs: Record<string, unknown>; layer: GeneralKey }) {
  const def = GENERAL[layer];
  const progress = attrs[G.progress];

  return (
    <Section title="Сонгосон объект" note={def.title}>
      <Rows
        items={[
          ...def.facets.map((f) => ({ key: f.label, value: text(attrs[f.field], 'Бүртгэгдээгүй') })),
          {
            key: 'Бодит гүйцэтгэл',
            value: (
              <span className="num" style={{ color: def.hue }}>
                {progress == null ? '—' : pct(Number(progress), 0)}
              </span>
            ),
          },
          { key: 'Зорилтот огноо', value: date(attrs[G.dueDate] as number) },
          {
            key: 'Талбай',
            value: <span className="num">{num(Number(attrs[G.area] ?? 0))} м²</span>,
          },
        ]}
      />
    </Section>
  );
}
