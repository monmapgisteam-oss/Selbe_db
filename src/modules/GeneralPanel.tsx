'use client';

import { type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { Section, Stats, Stat, Bars, Donut, Rows, Ring, Data, Empty, Col, Note, Split, SubHead } from '@/components/ui';
import { BORROWED_LAYERS, ZONE_LIST_HUE } from '@/components/MapCanvas';
import { useFilter } from '@/lib/filter';
import { useAsync } from '@/lib/useAsync';
import { queryGroup, queryStats, queryFeatures, count, sum, avg, groups, groupWhere, type Row } from '@/lib/query';
import {
  GENERAL, GENERAL_FIELDS as G, UTILITY, ZONE, PARCEL, PARCEL_STATUS, PARCEL_STATUS_EMPTY,
  PARCEL_STATUS_EMPTY_HUE, ZONE_TYPES, ZONE_TYPE_EMPTY_HUE, MODULES,
  type GeneralKey, type UtilKey,
} from '@/lib/services';
import { UtilityLayerDetail } from './UtilityPanel';
import { num, pct, ha, km, date, text } from '@/lib/format';
import s from './general.module.css';

const ZONE_HUE = ZONE_LIST_HUE;
const LAND_HUE = MODULES.find((m) => m.key === 'land')!.hue;

const KEYS = Object.keys(GENERAL) as GeneralKey[];
const UTIL_KEYS = Object.keys(UTILITY) as UtilKey[];

const isKey = (v: string): v is GeneralKey => (KEYS as string[]).includes(v);
const isUtilKey = (v: string): v is UtilKey => (UTIL_KEYS as string[]).includes(v);

/**
 * Бүх давхарга НЭГ жагсаалтад — бүлэглэлгүй.
 *
 * ⚠️ Ерөнхий давхаргууд болон дэд бүтцийн давхаргууд НЭГ `sublayers` массивыг
 * хуваадаг. Түлхүүр нь давхцахгүй (`built`, `green`… vs `heat`, `kv10`…) тул
 * нэг жагсаалтад аюулгүй нийлнэ.
 */
const ALL_LAYERS: { key: string; title: string; hue: string }[] = [
  ...KEYS.map((k) => ({ key: k as string, title: GENERAL[k].title, hue: GENERAL[k].hue })),
  ...UTIL_KEYS.map((k) => ({ key: k as string, title: UTILITY[k].title, hue: UTILITY[k].hue })),
  // Зээлдсэн — өөрсдийн модультай ч энд ч сонгогдоно (`BORROWED_LAYERS`)
  ...BORROWED_LAYERS.general,
];

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

    /**
     * Тухайн давхаргын талбарын нэрс. Ихэнх нь нийтлэг (`GENERAL_FIELDS`) ч
     * ногоон байгууламж тусдаа үйлчилгээнд шилжсэн тул өөрийн нэртэй.
     * ⚠️ `null` = тэр талбар БАЙХГҮЙ → статистикт огт оруулж болохгүй.
     */
    const F = { ...G, ...(def.fields ?? {}) };

    const avgs = def.avgs ?? [];

    const [totals, ...facets] = await Promise.all([
      queryStats(def.url, [
        count(F.oid, 'n'),
        ...(F.progress ? [avg(F.progress, 'g')] : []),
        ...(F.area ? [sum(F.area, 'area')] : []),
        ...(F.length ? [sum(F.length, 'len')] : []),
        ...sums.map((x, i) => sum(x.field, `x${i}`)),
        ...avgs.map((x, i) => avg(x.field, `a${i}`)),
      ]),
      ...def.facets.map((f) =>
        queryGroup(def.url, f.field, [count(F.oid, 'n'), ...(F.area ? [sum(F.area, 'area')] : [])]),
      ),
    ]);

    return {
      count: Number(totals.n ?? 0),
      progress: totals.g == null ? null : Number(totals.g),
      areaM2: Number(totals.area ?? 0),
      lengthM: Number(totals.len ?? 0),
      // ⚠️ Дундажтай ЯГ адил: `?? 0` хийвэл өгөгдөлгүй давхарга «0 айл» гэж
      //    харагдаж, жинхэнэ хэмжсэн тэгээс ялгагдахгүй болно.
      sums: sums.map((x, i) => ({
        label: x.label,
        value: totals[`x${i}`] == null ? null : Number(totals[`x${i}`]),
        unit: x.unit,
      })),
      // ⚠️ Дундажийг `?? 0` гэж дүүргэхгүй: өгөгдөлгүй үед «0.0 м» гэсэн ХУДАЛ
      //    тоо гарч, жинхэнэ тэгээс ялгагдахгүй болно.
      avgs: avgs.map((x, i) => ({
        label: x.label,
        value: totals[`a${i}`] == null ? null : Number(totals[`a${i}`]),
        unit: x.unit,
        digits: x.digits ?? 1,
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

/**
 * ЗҮҮН багана — зөвхөн давхаргын жагсаалт.
 *
 * ⚠️ Мэдээллээс тусад нь салгасан: 18 давхаргын жагсаалт болон тэдгээрийн
 * дэлгэрэнгүй нэг баганад байхад жагсаалт дээш гүйлгэгдэж алга болж, хэрэглэгч
 * давхарга солихын тулд байнга буцаж гүйлгэх шаардлагатай байв.
 */
export function GeneralLayers({
  clearPicked,
  sublayers,
  setSublayers,
}: {
  clearPicked: () => void;
  sublayers: string[];
  /** Функциональ шинэчлэлт заавал дэмжинэ — дараалсан даралт бие биенээ дарж бичихгүй */
  setSublayers: Dispatch<SetStateAction<string[]>>;
}) {
  const { clear } = useFilter();

  // ⚠️ «Хоосон бол анхдагчаа тавь» гэсэн эффект БАЙХГҮЙ. Шугам сүлжээ нэг модульд
  //    нэгдэж, `sublayers`-ыг ХУВААХ болсон тул хоёр самбар тус тусын анхдагчийг
  //    тавибал бие биенээ дарж бичнэ. Анхдагчийг `DEFAULT_SUBLAYERS`-ээс модуль
  //    солигдох үед нэг удаа тавина (`Portal.go`).

  /** Давхаргыг ил/далд болгох. Сүүлчийнхийг унтраахыг зөвшөөрнө. */
  const toggle = (k: string) => {
    // ⚠️ Функциональ шинэчлэлт: хэд хэдэн даралт нэг батчид орвол хуучин массивыг
    //    уншиж бие биенээ дарж бичихээс сэргийлнэ.
    setSublayers((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
    // ⚠️ Шүүлт нь тухайн давхаргын талбарын нэрээр бичигдсэн. Давхаргыг унтраахад
    //    үлдвэл өөр давхаргад тэр талбар байхгүй тул хүсэлт унаж, зураг хоосорно.
    clear();
    // Сонгосон объектыг цэвэрлэнэ — эс бөгөөс өмнөх давхаргын атрибут өөр давхаргын
    // талбарын нэрсээр уншигдаж, бүх мөр «Бүртгэгдээгүй» болно.
    clearPicked();
  };

  return (
    <>
      {/* БҮХ давхарга нэг жагсаалтад — бүлэггүй. Урьд нь ерөнхий 7 нэг самбарт,
          дэд бүтцийн 11 өөр самбарт, өөр өөр хэлбэрээр гардаг байлаа. */}
      <Section title="Давхарга" note="олон давхаргыг зэрэг харж болно">
        <Col gap="sm">
        <div className={s.layers}>
          {ALL_LAYERS.map((it) => {
            const on = sublayers.includes(it.key);
            return (
              <button
                key={it.key}
                type="button"
                role="switch"
                aria-checked={on}
                className={`${s.layer} ${on ? s.layerOn : ''}`}
                style={{ '--tone': it.hue } as CSSProperties}
                onClick={() => toggle(it.key)}
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
                <span className={s.name}>{it.title}</span>
              </button>
            );
          })}
        </div>

        {sublayers.length === 0 && (
          <Note>Давхарга сонгоогүй байна — газрын зураг хоосон харагдана.</Note>
        )}
        </Col>
      </Section>
    </>
  );
}

/**
 * БАРУУН багана — сонгосон давхаргуудын мэдээлэл.
 *
 * Давхарга тус бүр ӨӨРИЙН хэсэгтэй. Урьд нь «фокус» гэсэн нэг давхарга л
 * дэлгэрэнгүйгээ харуулж, бусад нь зөвхөн зурагт харагддаг байв — олон давхарга
 * асаасан хэрэглэгч тэдгээрийн тоог харах боломжгүй байлаа.
 */
export function GeneralInfo({
  picked,
  pickedLayer,
  sublayers,
}: {
  picked: Record<string, unknown> | null;
  pickedLayer: string | null;
  sublayers: string[];
}) {
  const visibleGeneral = sublayers.filter(isKey) as GeneralKey[];
  const visibleUtil = sublayers.filter(isUtilKey) as UtilKey[];
  const pickedKey = keyOfLayer(pickedLayer);

  if (sublayers.length === 0) {
    return (
      <Section>
        <Empty label="Зүүн талын жагсаалтаас давхарга сонгоно уу." />
      </Section>
    );
  }

  return (
    <>
      {visibleGeneral.map((k) => (
        <GeneralLayerDetail key={k} layerKey={k} />
      ))}

      {visibleUtil.map((k) => (
        <UtilityLayerDetail key={k} layerKey={k} />
      ))}

      {sublayers.includes('zone') && <ZoneBrief />}
      {sublayers.includes('parcel') && <ParcelBrief />}

      {picked && pickedKey && <PickedFeature attrs={picked} layer={pickedKey} />}
    </>
  );
}

/* ═════════ Зээлдсэн давхаргын товч үзүүлэлт ═════════ */

/**
 * ⚠️ Эдгээр нь ТОВЧ. Бүсийн төсөв, зогсоолын норм, чөлөөлөлтийн явцын дэлгэрэнгүй
 * шинжилгээ нь өөрсдийн модульд («Бүсчлэл», «Газар») хэвээр байгаа — тэднийг энд
 * хуулбарлавал нэг агуулга хоёр газар зэрэг засагдаж, салж эхэлнэ.
 */
function ZoneBrief() {
  const q = useAsync(async () => {
    // ⚠️ `outStatistics` ашиглахгүй: 59 мөр бол хямд бөгөөд ZONE_ID-аар давхардсан
    //    7 полигоныг клиент талд хасах шаардлагатай (сервер талд боломжгүй).
    const rows = await queryFeatures(ZONE.url, { outFields: ['*'] });
    const F = ZONE.fields;
    const seen = new Set<string>();
    const zones = rows.filter((r) => {
      const id = String(r[F.id] ?? '').trim();
      if (!id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const S = (f: string) => zones.reduce((a, r) => a + Number(r[f] ?? 0), 0);

    const facet = (field: string) =>
      groups(
        zones.map((r) => ({ [field]: r[field], n: 1, ga: Number(r[F.landHa] ?? 0) })) as Row[],
        field, 'Бүртгэгдээгүй', ['n', 'ga'],
      ).sort((a, b) => b.values.n - a.values.n);

    const norm = S(F.parkNorm);
    const plan = S(F.parkTotal);
    const landHa = S(F.landHa);
    const builtM2 = S(F.builtM2);

    return {
      n: zones.length, dup: rows.length - zones.length,
      ga: landHa, ail: S(F.households), builtM2,
      density: landHa > 0 ? builtM2 / (landHa * 10_000) : null,
      norm, plan, exist: S(F.existTotal),
      parkOpen: S(F.parkOpen), parkUnder: S(F.parkUnder),
      coverage: norm > 0 ? (plan / norm) * 100 : null,
      budget: S(F.budget), done: S(F.done2025), left: S(F.left2026),
      // ⚠️ `BAGTS_DUG`-аар задлахгүй: 52 бүсэд 52 ӨӨР утгатай (100% өвөрмөц) тул
      //    ангилал биш, ТАНИХ ДУГААР. Задалбал бүс бүрийг дахин жагсаана.
      types: facet(F.type), purpose: facet(F.purpose),
    };
  }, []);

  return (
    <Data q={q}>
      {(d) => (
        <>
          <Section title="Хот төлөвлөлтийн бүс" note={d.dup > 0 ? `${d.dup} давхардал хасав` : undefined}>
            <Col gap="sm">
              <Stats cols={3}>
                <Stat value={num(d.n)} label="Бүс" color={ZONE_HUE} accent />
                <Stat value={num(d.ga, 1)} unit="га" label="Талбай" color={ZONE_HUE} />
                <Stat value={num(d.ail)} label="Төлөвлөсөн айл" color={ZONE_HUE} />
              </Stats>
              <Stats cols={2}>
                <Stat value={num(d.builtM2 / 1000, 0)} unit="мянган м²" label="Барилгын талбай" color={ZONE_HUE} />
                <Stat value={num(d.density, 2)} label="Нягтрал (барилга м² / газар м²)" color={ZONE_HUE} />
              </Stats>
              <div>
                <SubHead>Бүсийн ангилал</SubHead>
                <Donut
                  center={num(d.n)}
                  centerLabel="бүс"
                  items={d.types.map((g) => ({
                    key: g.label, label: g.label, value: g.values.n,
                    color: ZONE_TYPES[g.label] ?? ZONE_TYPE_EMPTY_HUE,
                  }))}
                />
              </div>
            </Col>
          </Section>

          <Section title="Авто зогсоол" note="норм ба төлөвлөсөн">
            <Split
              aside={
                <Ring
                  value={d.coverage}
                  size={84}
                  width={9}
                  label="хүртээмж"
                  color={d.coverage != null && d.coverage < 50 ? 'var(--bad)' : ZONE_HUE}
                />
              }
            >
              <Rows
                items={[
                  { key: 'Шаардлагатай (норм)', value: <span className="num">{num(d.norm)}</span> },
                  { key: 'Төлөвлөсөн — нийт', value: <span className="num">{num(d.plan)}</span> },
                  { key: '· ил', value: <span className="num">{num(d.parkOpen)}</span> },
                  { key: '· далд', value: <span className="num">{num(d.parkUnder)}</span> },
                  { key: 'Одоо байгаа', value: <span className="num">{num(d.exist)}</span> },
                  {
                    key: 'Дутагдал',
                    value: <span className={`num ${s.bad}`}>{num(Math.max(0, d.norm - d.plan))}</span>,
                  },
                ]}
              />
            </Split>
          </Section>

          {d.budget > 0 && (
            <Section title="Төсөв ба гүйцэтгэл">
              <Stats cols={3}>
                <Stat value={num(d.budget / 1e9, 1)} unit="тэрбум ₮" label="Нийт төсөв" color={ZONE_HUE} accent />
                <Stat value={num(d.done / 1e9, 1)} unit="тэрбум ₮" label="2025 гүйцэтгэл" color={ZONE_HUE} />
                <Stat value={num(d.left / 1e9, 1)} unit="тэрбум ₮" label="2026 үлдэгдэл" color={ZONE_HUE} />
              </Stats>
            </Section>
          )}

          {d.purpose.length > 1 && (
            <Section title="Зориулалт" note={`${d.purpose.length} төрөл`}>
              <Bars
                color={ZONE_HUE}
                items={d.purpose.map((g) => ({
                  key: g.label, label: g.label, value: g.values.n,
                  display: `${num(g.values.n)} · ${num(g.values.ga, 1)} га`,
                }))}
              />
            </Section>
          )}

        </>
      )}
    </Data>
  );
}

function ParcelBrief() {
  const q = useAsync(async () => {
    const [totals, byStatus] = await Promise.all([
      queryStats(PARCEL.url, [count(PARCEL.oid, 'n'), sum(PARCEL.fields.area, 'm2')]),
      queryGroup(PARCEL.url, PARCEL.fields.status, [count(PARCEL.oid, 'n')]),
    ]);
    return {
      n: Number(totals.n ?? 0),
      m2: Number(totals.m2 ?? 0),
      items: groups(byStatus, PARCEL.fields.status, PARCEL_STATUS_EMPTY, ['n']),
    };
  }, []);

  return (
    <Section title="Үлдсэн нэгж талбар">
      <Data q={q}>
        {(d) => (
          <>
            <Col gap="md">
              <Stats cols={2}>
                <Stat value={num(d.n)} label="Талбарын тоо" color={LAND_HUE} accent />
                <Stat value={ha(d.m2, 2)} unit="га" label="Нийт талбай" color={LAND_HUE} />
              </Stats>
              <div>
                <SubHead note={`${d.items.length} төлөв`}>Чөлөөлөлтийн явц</SubHead>
                <Bars
                  items={d.items.map((g) => ({
                    key: g.label,
                    label: g.label,
                    value: g.values.n,
                    display: num(g.values.n),
                    color: PARCEL_STATUS[g.label] ?? PARCEL_STATUS_EMPTY_HUE,
                  }))}
                />
              </div>
            </Col>
          </>
        )}
      </Data>
    </Section>
  );
}

/**
 * НЭГ ерөнхий давхаргын үзүүлэлт — тоо, талбай, гүйцэтгэл, ангиллын задаргаа.
 *
 * ⚠️ Ангилал сонгох (`facet`) төлөв нь ГАДНААС ирнэ. Зураг дээрх тодруулга
 * (`setHighlight`) нь БҮХ давхаргад нэг мөр үйлчилдэг тул хоёр давхаргад зэрэг
 * ангилал сонгогдвол хоёр дахь нь эхнийхийг чимээгүй дарж бичих байлаа. Нэг
 * дундын төлөвтэй байснаар аль нэг л идэвхтэй байна.
 */
function GeneralLayerDetail({ layerKey }: { layerKey: GeneralKey }) {
  const def = GENERAL[layerKey];
  const q = useGeneral(layerKey);
  const { toggle, active } = useFilter();

  return (
    <Section title={def.title}>
      <Data q={q}>
        {(d) => (
          <Col gap="md">
            <Stats cols={3}>
              <Stat value={num(d.count)} label="Объектын тоо" color={def.hue} accent />
              {d.areaM2 > 0 && <Stat value={ha(d.areaM2, 1)} unit="га" label="Талбай" color={def.hue} />}
              {d.lengthM > 0 && <Stat value={km(d.lengthM, 1)} unit="км" label="Нийт урт" color={def.hue} />}
            </Stats>

            {(d.sums.length > 0 || d.avgs.length > 0) && (
              <Rows
                items={[
                  ...d.sums.map((x) => ({
                    key: x.label,
                    value: (
                      <span className="num">
                        {x.value == null ? '—' : num(x.value)}
                        {x.value != null && x.unit ? ` ${x.unit}` : ''}
                      </span>
                    ),
                  })),
                  ...d.avgs.map((x) => ({
                    key: x.label,
                    value: (
                      <span className="num">
                        {x.value == null ? '—' : num(x.value, x.digits)}
                        {x.value != null && x.unit ? ` ${x.unit}` : ''}
                      </span>
                    ),
                  })),
                ]}
              />
            )}

            {d.progress != null && (
              <Split aside={<Ring value={d.progress} color={def.hue} size={78} width={8} />}>
                <Note>
                  Бодит гүйцэтгэлийн дундаж. Үйлчилгээнд «төлөвлөсөн гүйцэтгэл %» гэсэн талбар
                  байхгүй тул зөвхөн бодит хувь харагдана.
                </Note>
              </Split>
            )}

            {d.facets.map((f) => (
              <div key={f.label}>
                <SubHead note="дарж газрын зурагт шүүнэ">{f.label}</SubHead>
                <Bars
                  color={def.hue}
                  selected={active?.key ?? null}
                  onSelect={(k) => {
                    const g = f.items.find((x) => `${layerKey}|${f.label}:${x.label}` === k);
                    if (!g) return;
                    toggle({
                      key: k,
                      label: `${f.label}: ${g.label}`,
                      group: def.title,
                      // groupWhere нь нэгтгэсэн бүх түүхий утгыг хамруулна —
                      // баганад тоологдсонтой яг ижил олонлог сонгогдоно
                      where: groupWhere(f.field, g),
                      module: 'general',
                      color: def.hue,
                    });
                  }}
                  items={f.items.map((g) => ({
                    // ⚠️ Түлхүүрт давхаргын нэрийг заавал оруулна: хоёр давхаргад ижил
                    //    нэртэй ангилал (жишээ нь «Төрөл») байвал сонголт нь холилдоно.
                    key: `${layerKey}|${f.label}:${g.label}`,
                    label: g.label,
                    value: g.values.n,
                    display:
                      g.values.area > 0
                        ? `${num(g.values.n)} · ${ha(g.values.area, 1)} га`
                        : num(g.values.n),
                  }))}
                />
              </div>
            ))}
          </Col>
        )}
      </Data>
    </Section>
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
  const F = { ...G, ...(def.fields ?? {}) };

  /**
   * ⚠️ Мөрүүдийг НӨХЦӨЛТЭЙ угсарна. Ногоон байгууламжид гүйцэтгэл, зорилтот огноо
   * гэсэн талбар байхгүй тул тэднийг «—» гэж харуулбал өгөгдөл байгаа мөртлөө
   * хоосон мэт ХУДАЛ сэтгэгдэл төрүүлнэ — байхгүй мөрийг огт гаргахгүй нь зөв.
   */
  const rows: { key: string; value: React.ReactNode }[] = [
    ...def.facets.map((f) => ({ key: f.label, value: text(attrs[f.field], 'Бүртгэгдээгүй') })),
  ];

  if (F.progress) {
    const p = attrs[F.progress];
    rows.push({
      key: 'Бодит гүйцэтгэл',
      value: (
        <span className="num" style={{ color: def.hue }}>
          {p == null ? '—' : pct(Number(p), 0)}
        </span>
      ),
    });
  }
  if (F.dueDate) rows.push({ key: 'Зорилтот огноо', value: date(attrs[F.dueDate] as number) });
  if (F.area) {
    rows.push({
      key: 'Талбай',
      value: <span className="num">{num(Number(attrs[F.area] ?? 0))} м²</span>,
    });
  }
  // Тухайн объектын тоон утгууд — нийлбэр/дундажид ашигладаг талбарууд нь
  // объект тус бүрийн хувьд ч утгатай (давхар, өндөр, өргөн, айлын тоо…)
  for (const x of [...(def.sums ?? []), ...(def.avgs ?? [])]) {
    if (attrs[x.field] == null) continue;
    rows.push({
      key: x.label.replace(/^Дундаж /, ''),
      value: <span className="num">{num(Number(attrs[x.field]), 1)} {x.unit ?? ''}</span>,
    });
  }

  // Зөвхөн объектод утгатай талбар (кадастрын дугаар гэх мэт)
  for (const x of def.details ?? []) {
    rows.push({ key: x.label, value: text(attrs[x.field], 'Бүртгэгдээгүй') });
  }

  return (
    <Section title="Сонгосон объект" note={def.title}>
      <Rows items={rows} />
    </Section>
  );
}
