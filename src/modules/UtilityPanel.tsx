'use client';

import { Section, Stats, Stat, Bars, Data, Col, Note, SubHead } from '@/components/ui';
import { useFilter } from '@/lib/filter';
import { useAsync } from '@/lib/useAsync';
import { queryStats, queryGroup, count, sum, groups, groupWhere } from '@/lib/query';
import { UTILITY, type UtilKey } from '@/lib/services';
import { num, km, ha } from '@/lib/format';

/**
 * Дэд бүтцийн НЭГ давхаргын үзүүлэлт.
 *
 * ⚠️ Урьд нь энэ самбар 4 давхаргыг НЭГ дор нэгтгэж, өөрийн гэсэн жагсаалт,
 * нийлбэр график харуулдаг байв. «Ерөнхий мэдээлэл»-д нэгдэж, давхаргын тоо 18
 * болсноор тэр хэлбэр ажиллахаа больсон: хэрэглэгч ерөнхий давхаргад нэг маягийн,
 * шугамд өөр маягийн UI-тай тулгарч байлаа. Одоо давхарга бүр өөрийн хэсэгтэй,
 * ерөнхий давхаргуудтай ЯГ ижил хэлбэрээр (тоо → задаргаа) гарна.
 */
function useUtilityLayer(key: UtilKey) {
  return useAsync(async () => {
    const u = UTILITY[key];
    const facetDefs = u.facets ?? [];

    const [st, ...facetRows] = await Promise.all([
      // Цэгэн давхаргад `Shape__Length` талбар БАЙХГҮЙ — асуувал хүсэлт унана
      queryStats(u.url, [
        count('OBJECTID', 'n'),
        ...(u.kind === 'point' ? [] : [sum('Shape__Length', 'len')]),
        ...(u.kind === 'area' ? [sum('Shape__Area', 'area')] : []),
      ]),
      ...facetDefs.map((f) =>
        queryGroup(u.url, f.field, [
          count('OBJECTID', 'n'),
          ...(u.kind === 'point' ? [] : [sum('Shape__Length', 'len')]),
        ]),
      ),
    ]);

    return {
      n: Number(st.n ?? 0),
      lengthM: Number(st.len ?? 0),
      areaM2: Number(st.area ?? 0),
      facets: facetDefs.map((f, i) => ({
        field: f.field,
        label: f.label,
        // ArcGIS нь null ба ' ' -г тусад нь бүлэглэдэг тул хоосныг нэгтгэнэ
        items: groups(facetRows[i], f.field, 'Бүртгэгдээгүй', ['n', 'len']),
      })),
    };
  }, [key]);
}

export function UtilityLayerDetail({ layerKey }: { layerKey: UtilKey }) {
  const u = UTILITY[layerKey];
  const q = useUtilityLayer(layerKey);
  const { toggle, active } = useFilter();

  return (
    <Section title={u.title}>
      <Data q={q}>
        {(d) => (
          <Col gap="md">
            <Stats cols={2}>
              <Stat
                value={num(d.n)}
                label={u.kind === 'point' ? 'Цэгийн тоо' : u.kind === 'line' ? 'Хэрчмийн тоо' : 'Объектын тоо'}
                color={u.hue}
                accent
              />
              {u.kind === 'line' && (
                <Stat value={km(d.lengthM, 2)} unit="км" label="Нийт урт" color={u.hue} />
              )}
              {u.kind === 'area' && (
                <Stat value={ha(d.areaM2, 2)} unit="га" label="Талбай" color={u.hue} />
              )}
            </Stats>

            {d.facets.map((f) => (
              <div key={f.label}>
                <SubHead note="дарж газрын зурагт шүүнэ">{f.label}</SubHead>
                <Bars
                  color={u.hue}
                  selected={active?.key ?? null}
                  onSelect={(k) => {
                    const g = f.items.find((x) => `${layerKey}|${f.label}:${x.label}` === k);
                    if (!g) return;
                    toggle({
                      key: k,
                      label: `${f.label}: ${g.label}`,
                      group: u.title,
                      where: groupWhere(f.field, g),
                      module: 'general',
                      color: u.hue,
                    });
                  }}
                  items={f.items.map((g) => ({
                    // ⚠️ Түлхүүрт давхаргын нэр заавал орно: гурван цахилгааны давхарга
                    //    бүгд «Бүс» гэсэн ижил ангилалтай тул эс бөгөөс сонголт холилдоно.
                    key: `${layerKey}|${f.label}:${g.label}`,
                    label: g.label,
                    value: g.values.n,
                    display:
                      g.values.len > 0
                        ? `${num(g.values.n)} · ${km(g.values.len, 2)} км`
                        : num(g.values.n),
                  }))}
                />
              </div>
            ))}

            <Note>
              CAD зургаас экспортлогдсон давхарга — зөвхөн геометр (урт, талбай) ба бүсийн
              холбоос агуулна. Материал, голч, техникийн төлөв зэрэг актив менежментийн
              талбар байхгүй.
            </Note>
          </Col>
        )}
      </Data>
    </Section>
  );
}
