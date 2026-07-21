'use client';

/**
 * АНАЛИЗ — дэд бүтцийн өртгийн задаргаа (үйлчилгээ тус бүрээр).
 *
 * ⚠️ Эх vanilla хувилбарын `loadCosts()` нь 24 давхаргын БҮХ объектыг (24,251
 * замын хэрчим, 3,200 дулааны шугам…) клиент рүү татаж нийлүүлдэг байв. Энд
 * давхарга бүрд НЭГ `groupBy(нэгж үнэ)` хүсэлт л явуулна — сервер нийлүүлж
 * өгнө. Үр дүн ижил, харин хэдэн зуу дахин хямд.
 */

import { queryGroup, count, sum } from '@/lib/query';
import { LAYERS, LAYER_BY_ID, layerUrl, OID, type LayerDef } from '@/lib/services';
import { costOf } from '@/lib/totals';
import { COST_EXCLUDE, COST_GROUP_OF, PROJECT_AREA_HA } from './config';

export type CostLayer = {
  id: string;
  label: string;
  group: string;
  /** Объектын тоо */
  count: number;
  /** Хэмжээ — цэгэнд ширхэг, шугаманд м/км, талбайд м² */
  qty: number;
  qtyUnit: string;
  /** Нэгж үнэ. Давхарга дотроо хувьсах бол хамгийн түгээмэл нь. */
  unitPrice: number | null;
  uniformPrice: boolean;
  /** Нэгж үнэ хэдэн нэгжид ногдох (шугаманд 100 м, км-д 1) */
  divisor: number;
  total: number;
};

export type Costs = {
  layers: CostLayer[];
  total: number;
  perHa: number;
  projectHa: number;
};

/** Порталын `cost.basis` → эх аппын «kind» ба хуваарь */
function shape(d: LayerDef): { kind: 'point' | 'line' | 'polygon'; unit: string; divisor: number } {
  switch (d.cost?.basis) {
    case 'sh': return { kind: 'point', unit: 'ш', divisor: 1 };
    case 'km': return { kind: 'line', unit: 'км', divisor: 1 };
    case 'm100': return { kind: 'line', unit: 'м', divisor: 100 };
    default: return { kind: 'polygon', unit: 'м²', divisor: 1 };
  }
}

export async function loadCosts(): Promise<Costs> {
  const defs = LAYERS.filter(
    (d) => d.topic === 'plan' && d.cost && !COST_EXCLUDE.has(d.id),
  );

  const layers = await Promise.all(defs.map(async (d): Promise<CostLayer> => {
    const { unit, divisor } = shape(d);
    const stats = [count(d.oid ?? OID, 'n'), ...(d.qty ? [sum(d.qty.field, 'q')] : [])];
    const rows = await queryGroup(layerUrl(d), d.cost!.field, stats, '1=1');

    let n = 0, qty = 0, total = 0;
    // Хамгийн олон объект эзэлсэн үнийг «давамгайлах нэгж үнэ» болгоно
    let top = { price: 0, n: -1 };
    for (const r of rows) {
      const price = Number(r[d.cost!.field] ?? 0);
      const rn = Number(r.n ?? 0);
      const rq = Number(r.q ?? 0);
      n += rn;
      qty += rq;
      total += costOf(d, rn, rq, price);
      if (rn > top.n) top = { price, n: rn };
    }

    const priced = rows.filter((r) => Number(r[d.cost!.field] ?? 0) > 0);

    return {
      id: d.id,
      label: d.title,
      group: COST_GROUP_OF[d.id] ?? 'amenity',
      count: n,
      // Цэгэн давхаргад «хэмжээ» нь ширхэгийн тоо
      qty: d.cost!.basis === 'sh' ? n : qty,
      qtyUnit: unit,
      unitPrice: top.n >= 0 ? top.price : null,
      uniformPrice: priced.length <= 1,
      divisor,
      total,
    };
  }));

  const total = layers.reduce((a, l) => a + l.total, 0);
  return { layers, total, perHa: total / PROJECT_AREA_HA, projectHa: PROJECT_AREA_HA };
}

/** Давхаргын нэрийг каталогоос — графикийн шошгонд */
export const layerTitle = (id: string) => LAYER_BY_ID[id]?.title ?? id;
