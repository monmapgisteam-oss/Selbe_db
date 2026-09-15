'use client';

/**
 * ДАВХАРГЫН ӨГӨГДЛИЙН ХУРААНГУЙ — «Инженерийн дэд бүтэц» хуудсанд давхарга
 * дарахад доор нь «энэ давхаргад ямар өгөгдөл байна» гэж задарна
 * (2026-09-11, хэрэглэгчийн хүсэлт).
 *
 * Талбар бүрд: нэр (alias) · бөглөлт (N/нийт) · утгууд.
 *   · домэйн/текст → хамгийн олон 5 утга тоогоор (домэйны КОД → НЭР)
 *   · тоо          → бага … их, уртын талбарт нийлбэр (м)
 *
 * ⚠️ ХООСОН ТАЛБАРЫГ 0 ГЭЖ ХАРУУЛАХГҮЙ. `Test0911S`-ийн ихэнх тайлбарын талбар
 * (`Diameter`, `Material`, `Work_Status`…) 2026-09-11-нд 0/181 бөглөлттэй.
 * «Диаметр 0» гэж харуулбал худал хэмжилт болно — «бөглөгдөөгүй» гэж тусад нь
 * бүлэглэнэ (CLAUDE.md: null ≠ 0).
 *
 * ⚠️ СХЕМ нь `butetsEdit.loadLayerMeta`-аас — alias ба домэйны толийг ДАХИН
 * бичихгүй, тэр нь аль хэдийн кэштэй.
 */

import { t as tr } from '@/lib/i18nCore';
import { queryFeatures } from '@/lib/query';
import { LAYER_BY_ID, layerUrl } from '@/lib/services';
import { loadLayerMeta } from '@/lib/butetsEdit';
import { subscribeTotals } from '@/lib/totals';

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

/**
 * ⚠️ Системийн ба координатын талбар ХАСАГДАНА: `X`/`Y`/`X_48N` мөр бүрд
 * өөр утгатай тул «хамгийн олон утга» нь 72 ширхэг нэг удаагийн тоо болно —
 * мэдээлэл биш, шуугиан.
 */
const HIDE = /^(OBJECTID|FID|GlobalID|Shape__\w+|CreationDate|Creator|EditDate|Editor|X|Y|X_48N|Y_48N)$/i;

/** Уртын талбар — нийлбэр нь утгатай (метр) */
const LENGTH = /^(urt_m|length_m|length_metr|shugam_urt)$/i;

const cache = new Map<string, Promise<LayerSummary>>();

/**
 * ⚠️ ЗАСВАРЫН ДАРАА КЭШ ЗААВАЛ ХАЯГДАНА (2026-09-15).
 *
 * Энэ хураангуй нь «Инженерийн дэд бүтэц»-ийн давхаргын МӨРҮҮДЭЭС бодогддог
 * бөгөөд портал тэдгээрт БОДИТООР бичдэг (атрибут, хэлбэр, нэмэх, устгах).
 * Хаяхгүй бол засвар хийсний дараа «N объект», талбарын бөглөлт сешн
 * дуустал ХУУЧИН тоогоо барина.
 *
 * ⚠️ ЯАГААД `dataBus.register` БИШ ВЭ: дэд бүтцийн давхаргад автобусын
 * хүснэгтийн түлхүүр БАЙХГҮЙ. Тэдгээрийн засварын ЦОРЫН ГАНЦ хүчингүй болгох
 * зам нь `dropTotalsCache()` — `DedButets`-ийн бичих бүх зам
 * (маягт, хэлбэр хадгалах, үйлдэл буцаах, устгах) түүнийг дууддаг. Шинэ
 * түлхүүр зохиовол бичигч талд хоёр дахь дуудлага нэмэх шаардлага гарч,
 * аль нэгийг нь мартах өдөр ирнэ.
 */
subscribeTotals(() => { cache.clear(); });

export function loadLayerSummary(layerId: string): Promise<LayerSummary> {
  const hit = cache.get(layerId);
  if (hit) return hit;
  const p = build(layerId);
  /* ⚠️ Унасан хүсэлтийг кэшэд ҮЛДЭЭХГҮЙ — дараагийн дарахад дахин оролдоно */
  p.catch(() => cache.delete(layerId));
  cache.set(layerId, p);
  return p;
}

async function build(layerId: string): Promise<LayerSummary> {
  const L = LAYER_BY_ID[layerId];
  if (!L) throw new Error(tr('Давхарга танигдсангүй: {0}', layerId));

  const [meta, rows] = await Promise.all([
    loadLayerMeta(layerId),
    queryFeatures(layerUrl(L), { outFields: ['*'] }),
  ]);

  const defs = [...meta.fields, ...meta.readOnly].filter((f) => !HIDE.test(f.name));
  const fields: FieldSummary[] = [];
  const empty: string[] = [];

  for (const f of defs) {
    const vals = rows
      .map((r) => r[f.name])
      .filter((v) => v != null && v !== '');
    if (!vals.length) { empty.push(f.alias); continue; }

    const isNum = vals.every((v) => typeof v === 'number' && Number.isFinite(v));
    if (isNum && !f.codes) {
      const ns = vals as number[];
      fields.push({
        name: f.name,
        label: f.alias,
        filled: vals.length,
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
