'use client';

/**
 * «ИРГЭДЭД ХҮРЭХ ҮР ӨГӨӨЖ» — АМЬД АЧААЛАГЧИД.
 *
 * ⚠️ ЯАГААД ТУСДАА МОДУЛЬ ВЭ. `live.ts` нь БҮХ харагдацын НИЙТЛЭГ үзүүлэлт
 * (талбай, хүн ам, төсөв) — тэнд зөвхөн нэг харагдацын асуулга нэмбэл түүнийг
 * импортлодог бүх модуль (нүүр, тайлан, дашбоард) дагаж хүндэрнэ. Энэ файлыг
 * ЗӨВХӨН `Irged.tsx` импортолно.
 *
 * ⚠️ 2026-09-06-ны шилжилт: урьд нь энэ харагдацын «ӨМНӨ» талд ЗӨВХӨН тоо
 * (`queryCount` ×3), «ДАРАА» талд бүхэлдээ `brief.ts`-ийн ХАТУУ мөрүүд байв.
 * Үйлчилгээнүүдийг хэмжихэд гурван бүлэг өгөгдөл ОГТ ХАРАГДАХГҮЙ байсныг
 * илрүүлэв:
 *   1. Гэр хорооллын барилгын ТАЛБАЙ (м², дундаж ул мөр)
 *   2. Нийгмийн барилгын АМЬД ХҮЧИН ЧАДАЛ (`Huchin_chadal`, нийт талбай)
 * Хоёулаа энд ачаалагдаж, чарт болж гарна.
 *
 * ⚠️ ГУРАВ ДАХЬ нь — нүхэн жорлонгийн эрсдэлийн загвар (`PLI_zone` ·
 * `Toilet_zon` · `Ground_wat` · `UB_Flood_r`) — мөн энд байсныг ХАСАВ:
 * тэдгээрийн 1–5 зэрэглэл юу гэсэн үг болох нь үйлчилгээнд ч (description,
 * alias, domain бүгд хоосон), репод ч БИЧЭЭГҮЙ. Шошго нь таамаг байсан тул
 * зурахгүй байхаар шийдэв. Загварын баримт олдвол `git` түүхээс сэргээнэ.
 *
 * ⚠️ БҮГД `cached()`-ээр — харагдац хооронд шилжихэд дахин татахгүй. `reads` таг
 * ӨГӨӨГҮЙ: эдгээр давхаргууд нь ХЭМЖИЛТ биш ТӨЛӨВЛӨЛТ/суурь өгөгдөл бөгөөд
 * порталаас бичигддэггүй тул `dataBus`-аар хүчингүй болох шалтгаангүй.
 */

import { count, queryFeatures, queryGroup, sum, type Row } from '@/lib/query';
import { cached } from '@/lib/live';
import { t as tr } from '@/lib/i18nCore';
import {
  IRGED_BUILT, IRGED_SOC,
  LAYER_BY_ID, PKG_BY_FAMILY,
  layerUrl,
} from '@/lib/services';

/* ══════════════════ Гэр хорооллын барилга ══════════════════ */

export type GerBuiltRow = {
  /** Түүхий утга — SQL шүүлтэд (`Байшин` / `Гэр`) */
  type: string;
  n: number;
  /** Нийт ул мөрийн талбай, м² */
  areaM2: number;
  /** Дундаж ул мөр, м² — `null` бол тоо нь 0 */
  avgM2: number | null;
  color?: string;
};

/**
 * ⚠️ НЭГ хүсэлт (`groupByFieldsForStatistics`) — урьд нь `queryCount` ХОЁР
 * удаа дуудагдаж зөвхөн тоо авдаг байв. Одоо тоо БА талбай нэг дор гарна:
 * хүсэлт нэгээр ЦӨӨРӨӨД өгөгдөл нэмэгдэв.
 */
export const loadGerBuilt = cached<GerBuiltRow[]>(async () => {
  const T = IRGED_BUILT.typeField;
  const rows = await queryGroup(IRGED_BUILT.url, T, [
    count(T, 'n'),
    sum(IRGED_BUILT.areaField, 'a'),
  ]);
  const paint = LAYER_BY_ID[IRGED_BUILT.id]?.paint?.values ?? {};
  return rows
    .map((r: Row) => {
      const type = String(r[T] ?? '').trim();
      const n = Number(r.n ?? 0);
      const areaM2 = Number(r.a ?? 0);
      return {
        type,
        n,
        areaM2,
        // ⚠️ 0-д хуваахгүй — тоо нь 0 бол «дундаж 0 м²» биш МЭДЭЭЛЭЛГҮЙ
        avgM2: n > 0 ? areaM2 / n : null,
        color: paint[type],
      };
    })
    .filter((x) => x.type !== '')
    .sort((a, b) => b.n - a.n);
});

/* ══════════════════ Төлөвлөсөн нийгмийн байгууламж ══════════════════ */

export type SocPlannedRow = {
  /** Зориулалтын АМЬД утга — бүлгийн түлхүүр ба SQL шүүлт */
  purpose: string;
  /** Тухайн зориулалтын барилгын тоо */
  n: number;
  /** Нийт хүчин чадал — `null` бол чадал бүртгэгдээгүй (0 БИШ) */
  capacity: number | null;
  /** Барилгын нийт талбай, м² */
  floorArea: number;
  /** Хамгийн их давхар */
  floors: number | null;
  /** Тухайн бүлгийн давхаргын id-ууд — газрын зурагт шүүхэд */
  layerIds: string[];
};

const S = IRGED_SOC.fields;

/**
 * Нийгмийн 10 давхаргаас атрибут татаж зориулалтаар нэгтгэнэ.
 *
 * ⚠️ ДАВХАРГА БҮР 1–2 объекттой тул `outStatistics` хийх утгагүй — мөрүүдийг
 * шууд татаад клиент талд нэгтгэнэ (10 хөнгөн хүсэлт, геометргүй).
 *
 * ⚠️ ЗОРИУЛАЛТААР бүлэглэнэ, давхаргаар БИШ: «Багц 20.1…20.5» тав нь бүгд
 * «Цэцэрлэгийн барилга» бөгөөд хэрэглэгчид тав тусад нь биш НЭГ мөр болж
 * харагдах нь зөв (`brief.ts`-ийн ӨМНӨ/ДАРАА мөртэй зэрэгцүүлэхэд ч ижил грейн).
 *
 * ⚠️ `outFields: ['*']` — НЭРЛЭСЭН талбарын жагсаалт БОЛОХГҮЙ. Давхаргуудын
 * схем ЖИГД БИШ: `data`/[0] дээр `Давхрын_тоо_max` байхгүй (`_min` байна) бөгөөд
 * ArcGIS байхгүй талбар нэрлэхэд БҮХ асуулгыг татгалздаг — тэр давхарга
 * бүхэлдээ унаж, цэцэрлэгийн чадал 1,200-ын оронд 960 болж байв
 * (`IRGED_SOC.floorFields`-ийн тайлбарыг үз). Мөр бүр 1–2 ширхэг, геометргүй
 * тул `*` нь ямар ч нэмэлт өртөггүй бөгөөд схемийн хазайлтад дархлаатай.
 *
 * ⚠️ `Promise.allSettled` — нэг давхарга унавал (шинэ багц нэмэгдэх үед
 * түр тохиолддог) БҮХ карт унахгүй, үлдсэн нь хэвийн гарна. Гэхдээ ЧИМЭЭГҮЙ
 * биш: унасныг `console.warn`-д бичнэ, эс бөгөөс дээрх шиг дутуу нийлбэр
 * дэлгэц дээр «зөв» мэт харагдана.
 */
export const loadSocPlanned = cached<SocPlannedRow[]>(async () => {
  const ids = PKG_BY_FAMILY.soc ?? [];
  const settled = await Promise.allSettled(
    ids.map(async (id) => {
      const L = LAYER_BY_ID[id];
      if (!L) return [];
      const rows = await queryFeatures(layerUrl(L), { outFields: ['*'] });
      return rows.map((r) => ({ id, r }));
    }),
  );

  const by = new Map<string, SocPlannedRow>();
  settled.forEach((s, k) => {
    if (s.status === 'rejected') {
      console.warn(`[selbe] нийгмийн давхарга татагдсангүй: ${ids[k]} — ${s.reason}`);
    }
  });
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const { id, r } of s.value) {
      const purpose = String(r[S.purpose] ?? '').trim() || tr('Тодорхойгүй');
      const cur = by.get(purpose) ?? {
        purpose, n: 0, capacity: null, floorArea: 0, floors: null, layerIds: [],
      };
      cur.n += 1;
      const cap = r[S.capacity];
      // ⚠️ `null` чадлыг 0 гэж НЭМЭХГҮЙ — бүлэг бүхэлдээ чадалгүй бол `null` үлдэнэ
      if (cap != null && Number.isFinite(Number(cap))) {
        cur.capacity = (cur.capacity ?? 0) + Number(cap);
      }
      cur.floorArea += Number(r[S.floorArea] ?? 0);
      /* ⚠️ Давхрын талбарын нэр давхарга бүрд ижил БИШ — олдсон эхнийхийг
         авна (`IRGED_SOC.floorFields`). Аль нь ч байхгүй бол `null` үлдэнэ. */
      const fName = IRGED_SOC.floorFields.find((f) => r[f] != null);
      const fl = fName == null ? NaN : Number(r[fName]);
      if (Number.isFinite(fl)) cur.floors = Math.max(cur.floors ?? 0, fl);
      if (!cur.layerIds.includes(id)) cur.layerIds.push(id);
      by.set(purpose, cur);
    }
  }
  /* Чадалтай нь дээр, дараа нь барилгын тоогоор — «хамгийн их хүн хамрах» нь
     эхэнд байх нь энэ харагдацын гол асуулт. */
  return [...by.values()].sort(
    (a, b) => (b.capacity ?? -1) - (a.capacity ?? -1) || b.n - a.n,
  );
});
