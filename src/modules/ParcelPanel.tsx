'use client';

import { useState } from 'react';
import { Section, Stats, Stat, Bars, Donut, Rows, Data, Chip, Empty } from '@/components/ui';
import { useMap } from '@/components/MapCanvas';
import { useAsync } from '@/lib/useAsync';
import { queryFeatures, groupWhere, groups, type Row } from '@/lib/query';
import {
  PARCEL, PARCEL_STATUS, PARCEL_STATUS_EMPTY, PARCEL_STATUS_EMPTY_HUE, MODULES,
} from '@/lib/services';
import { num, ha, date, text, blank } from '@/lib/format';

const HUE = MODULES.find((m) => m.key === 'land')!.hue;
const F = PARCEL.fields;

const statusColor = (label: string) => PARCEL_STATUS[label] ?? PARCEL_STATUS_EMPTY_HUE;

/**
 * Ангиллын задаргаа — ЗӨВХӨН бодитоор бөглөгдсөн талбар.
 *
 * ⚠️ Бөглөлтийн хувийг хэмжиж сонгосон. Бага бөглөлттэй талбарыг задаргаа болговол
 * «Бүртгэгдээгүй» гэсэн ганц том багана л харагдаж, мэдээлэл өгөхгүй.
 */
const FACETS: { field: string; label: string; note?: string }[] = [
  { field: F.status, label: 'Чөлөөлөлтийн явц' },
  { field: F.zone, label: 'Бүс' },
  { field: F.right, label: 'Эрхийн төрөл' },
  { field: F.landuse, label: 'Газар ашиглалт' },
  { field: F.purpose, label: 'Зориулалт' },
  { field: F.block, label: 'Блок' },
  { field: F.state, label: 'Бүртгэлийн төлөв' },
];

/**
 * ⚠️ `outStatistics` ашиглахгүй: 224 мөр бол хямд бөгөөд бүх задаргааг НЭГ хүсэлтээр
 * авснаар сервер рүү 8 удаа очихоос сэргийлнэ. Мөн талбай (`Талбай`) ба тооллого
 * хоёрыг нэг эх сурвалжаас бодох тул хоорондоо зөрөх боломжгүй.
 */
function useParcels() {
  return useAsync(async () => {
    const rows = await queryFeatures(PARCEL.url, { outFields: ['*'] });

    const areaM2 = rows.reduce((a, r) => a + Number(r[F.area] ?? 0), 0);
    /**
     * ⚠️ Дундажийг БҮХ мөрөөр бодож болохгүй. Талбайгүй бичлэг хүртэл хуваарьт
     * ороод, тоологчид 0 нэмнэ — дундаж нь мэдээлэлгүйн хувиар ХИЙСВЭР буурна.
     * Зөвхөн талбай нь БОДИТООР бичигдсэн бичлэгээр бодно.
     */
    const withArea = rows.filter((r) => r[F.area] != null && Number.isFinite(Number(r[F.area])));
    const withStatus = rows.filter((r) => !blank(r[F.status])).length;

    const facet = (field: string) =>
      groups(
        rows.map((r) => ({ [field]: r[field], n: 1, m2: Number(r[F.area] ?? 0) })) as Row[],
        field,
        PARCEL_STATUS_EMPTY,
        ['n', 'm2'],
      ).sort((a, b) => b.values.n - a.values.n);

    return {
      count: rows.length,
      areaM2,
      withStatus,
      /** Дундаж талбарын хэмжээ — нэгж талбарын хэмжээсийн мэдрэмж өгнө */
      avgM2: withArea.length
        ? withArea.reduce((a, r) => a + Number(r[F.area]), 0) / withArea.length
        : null,
      areaRows: withArea.length,
      owners: new Set(rows.map((r) => text(r[F.owner], '')).filter(Boolean)).size,
      facets: FACETS.map((f) => ({ ...f, items: facet(f.field) })),
    };
  }, []);
}

export function ParcelPanel({ picked }: { picked: Record<string, unknown> | null }) {
  const q = useParcels();
  const { setHighlight } = useMap();
  const [sel, setSel] = useState<string | null>(null);

  return (
    <Data q={q}>
      {(d) => (
        <>
          <Section title="Нэгдсэн үзүүлэлт">
            <Stats cols={3}>
              <Stat value={num(d.count)} label="Нэгж талбар" color={HUE} accent />
              <Stat value={ha(d.areaM2, 2)} unit="га" label="Нийт талбай" color={HUE} />
              <Stat
                value={d.avgM2 == null ? '—' : num(d.avgM2, 0)}
                unit={d.avgM2 == null ? undefined : 'м²'}
                label={`Дундаж талбай (${num(d.areaRows)} талбартай)`}
                color={HUE}
              />
            </Stats>
            <div style={{ marginTop: 10 }}>
              <Stats cols={2}>
                <Stat value={num(d.owners)} label="Бүртгэгдсэн эзэмшигч" color={HUE} />
                <Stat
                  value={`${num(d.withStatus)} / ${num(d.count)}`}
                  label="Явцын мэдээ бүртгэгдсэн"
                  color={d.withStatus / d.count < 0.5 ? 'var(--warn)' : HUE}
                />
              </Stats>
            </div>
          </Section>

          {/* Чөлөөлөлтийн явц — модулийн ГОЛ үзүүлэлт тул дугуй диаграмаар онцолно */}
          {d.facets[0].items.length > 0 && (
            <Section title="Чөлөөлөлтийн явц" note={`${d.facets[0].items.length} төлөв`}>
              <Donut
                center={num(d.count)}
                centerLabel="талбар"
                items={d.facets[0].items.map((g) => ({
                  key: g.label,
                  label: g.label,
                  value: g.values.n,
                  color: statusColor(g.label),
                }))}
              />
            </Section>
          )}

          {/* Бусад задаргаа — дарж газрын зурагт шүүнэ */}
          {d.facets.slice(1).map((f) =>
            f.items.length === 0 ? null : (
              <Section key={f.label} title={f.label} note="дарж газрын зурагт шүүнэ">
                <Bars
                  color={HUE}
                  selected={sel}
                  onSelect={(k) => {
                    const g = f.items.find((x) => `${f.label}:${x.label}` === k);
                    const next = sel === k ? null : k;
                    setSel(next);
                    setHighlight(next && g ? groupWhere(f.field, g) : null);
                  }}
                  items={f.items.map((g) => ({
                    key: `${f.label}:${g.label}`,
                    label: g.label,
                    value: g.values.n,
                    display: `${num(g.values.n)} · ${ha(g.values.m2, 2)} га`,
                  }))}
                />
              </Section>
            ),
          )}

          {picked ? <PickedParcel attrs={picked} /> : (
            <Section>
              <Empty label="Газрын зураг дээр талбар дээр дарж дэлгэрэнгүйг харна уу." />
            </Section>
          )}
        </>
      )}
    </Data>
  );
}

/**
 * Сонгосон нэгж талбарын БҮХ мэдээлэл.
 *
 * ⚠️ Хоосон талбарыг ОГТ гаргахгүй. Үйлчилгээнд 60+ талбар байдаг ч ихэнх нь
 * 20%-иас доош бөглөлттэй — бүгдийг «—»-тэй харуулбал жинхэнэ өгөгдөл нь
 * хоосон мөрүүдийн дунд алдагдана.
 */
function PickedParcel({ attrs }: { attrs: Record<string, unknown> }) {
  const st = text(attrs[F.status], PARCEL_STATUS_EMPTY);

  const rows: { key: string; value: React.ReactNode }[] = [];
  const put = (key: string, field: string, fmt?: (v: unknown) => React.ReactNode) => {
    const v = attrs[field];
    if (v == null || String(v).trim() === '') return;
    rows.push({ key, value: fmt ? fmt(v) : text(v) });
  };
  const numCell = (v: unknown, unit = '') => (
    <span className="num">{num(Number(v))}{unit && ` ${unit}`}</span>
  );

  put('Нэгж талбарын дугаар', F.parcelNo, (v) => <span className="num">{text(v)}</span>);
  put('Эзэмшигч', F.owner);
  put('Эзэмшигч (нэмэлт)', F.ownerAlt);
  put('Хаяг', F.address);
  put('Гудамж', F.street);
  put('Талбай', F.area, (v) => numCell(v, 'м²'));
  put('Талбай (га)', F.areaHa, (v) => <span className="num">{num(Number(v), 3)} га</span>);
  put('Эрхийн төрөл', F.right);
  put('Газар ашиглалт', F.landuse);
  put('Зориулалт', F.purpose);
  put('Бүс', F.zone);
  put('Блок', F.block);
  put('Бүртгэлийн төлөв', F.state);
  put('Эрх үүссэн огноо', F.validFrom, (v) => date(v as number));
  put('Шийдвэрийн дугаар', F.decisionNo);
  put('Шийдвэрийн огноо', F.decisionDate, (v) => date(v as number));
  put('Гэрээний дугаар', F.contractNo);
  put('Утас', F.phone, (v) => <span className="num">{text(v)}</span>);

  rows.push({ key: 'Явцын мэдээ', value: <Chip color={statusColor(st)}>{st}</Chip> });

  return (
    <Section title="Сонгосон нэгж талбар" note={`${rows.length} талбар`}>
      <Rows items={rows} />
      {!blank(attrs[F.note]) && (
        <p style={{ marginTop: 12, fontSize: '0.74rem', lineHeight: 1.55, color: 'var(--ink-2)' }}>
          {String(attrs[F.note])}
        </p>
      )}
    </Section>
  );
}
