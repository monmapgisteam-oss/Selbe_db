'use client';

/**
 * ДАВХАРГЫН ӨГӨГДЛИЙН ХУРААНГУЙ — «Инженерийн дэд бүтэц» хуудсанд давхарга
 * дарахад доор нь «энэ давхаргад ямар өгөгдөл байна» гэж задарна
 * (2026-09-11, хэрэглэгчийн хүсэлт).
 *
 * Талбар бүрд: нэр (alias) · бөглөлт (N/нийт) · утгууд.
 *   · домэйн/текст → хамгийн олон 5 утга тоогоор (домэйны КОД → НЭР)
 *   · тоо          → бага … их, уртын талбарт нийлбэр (м)
 */

import { t as tr } from '@/lib/i18nCore';
import { queryFeatures } from '@/lib/query';
import { LAYER_BY_ID, layerUrl } from '@/lib/services';
import { loadLayerMeta } from '@/lib/butetsEdit';
import { subscribeTotals, withLayerWhere } from '@/lib/totals';

export type FieldSummary = {
  name: string;
  label: string;
  filled: number;
  /** Хамгийн олон утгууд — текст/домэйн талбарт */
  top: { value: string; count: number }[] | null;
  /** Тоон талбарт */
  num: { min: number; max: number; sum: number | null } | null;
};

export type LayerSummary = {
  total: number;
  fields: FieldSummary[];
  /** Нэг ч мөрөнд бөглөгдөөгүй талбарууд — нэрсээр нь */
  empty: string[];
};

const HIDE = /^(objectid|fid|globalid|shape__\w+|creationdate|creator|editdate|editor|created_user|created_date|last_edited_user|last_edited_date|x|y|x_48n|y_48n)$/i;

/** Уртын талбар — нийлбэр нь утгатай (метр) */
const LENGTH = /^(urt_m|length_m|length_metr|shugam_urt)$/i;

const cache = new Map<string, Promise<LayerSummary>>();

/**
 * Энэ хураангуй нь «Инженерийн дэд бүтэц»-ийн давхаргын МӨРҮҮДЭЭС бодогддог
 * бөгөөд портал тэдгээрт БОДИТООР бичдэг (атрибут, хэлбэр, нэмэх, устгах).
 * Хаяхгүй бол засвар хийсний дараа «N объект», талбарын бөглөлт сешн
 * дуустал ХУУЧИН тоогоо барина.
 */
subscribeTotals(() => { cache.clear(); });

export function loadLayerSummary(layerId: string): Promise<LayerSummary> {
  const hit = cache.get(layerId);
  if (hit) return hit;
  const p = build(layerId);
  p.catch(() => cache.delete(layerId));
  cache.set(layerId, p);
  return p;
}

async function build(layerId: string): Promise<LayerSummary> {
  const L = LAYER_BY_ID[layerId];
  if (!L) throw new Error(tr('Давхарга танигдсангүй: {0}', layerId));

  const [meta, rows] = await Promise.all([
    loadLayerMeta(layerId),
    queryFeatures(layerUrl(L), { where: withLayerWhere(L, null), outFields: ['*'] }),
  ]);

  const defs = [...meta.fields, ...meta.readOnly].filter((f) => !HIDE.test(f.name));
  const fields: FieldSummary[] = [];
  const empty: string[] = [];

  for (const f of defs) {
    const vals = rows
      .map((r) => r[f.name])
      .filter((v) => v != null && v !== '');
    if (!vals.length) { empty.push(f.alias); continue; }

    const nums = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const isNum = f.kind === 'number' && nums.length > 0;
    if (isNum && !f.codes) {
      const ns = nums;
      fields.push({
        name: f.name,
        label: f.alias,
        filled: nums.length,
        top: null,
        num: {
          min: Math.min(...ns),
          max: Math.max(...ns),
          sum: LENGTH.test(f.name) ? ns.reduce((a, b) => a + b, 0) : null,
        },
      });
      continue;
    }

    const label = new Map((f.codes ?? []).map((c) => [c.code, c.label]));
    const count = new Map<string, number>();
    for (const v of vals) {
      const k = label.get(String(v)) ?? String(v);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    fields.push({
      name: f.name,
      label: f.alias,
      filled: vals.length,
      top: [...count]
        .map(([value, n]) => ({ value, count: n }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      num: null,
    });
  }

  return { total: rows.length, fields, empty };
}
