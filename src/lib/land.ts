'use client';

/**
 * ГАЗАР ЧӨЛӨӨЛӨЛТИЙН НЭГДСЭН АМЬД ТООЦОО — `PARCEL_LEFT` (test_data [94]).
 *
 * ⚠️ Урьд нь «Газар чөлөөлөлт» харагдац АМЬД (90%), харин Ерөнхий дашбоард/
 * Тайлан нь илтгэлээс бэхлэгдсэн ӨӨР тоо (95.5% · LAND ◆) харуулж хоёр газар
 * ЗӨРДӨГ байв. Одоо бүх дашбоард ЭНЭ ганц тооцооноос уншина (хэрэглэгчийн
 * шийдвэр, 2026-08-13: хатуу тоо байхгүй, бүгд үйлчилгээнээс).
 *
 * Томьёо нь Gazar.tsx-тэй ЯГ ИЖИЛ: чөлөөлсөн = «Бүрэн чөлөөлсөн» + «Цэвэрлэсэн
 * нэгж талбар»; хувь = чөлөөлсөн ÷ нийт (бүх төлөв, null орно).
 */

import { queryGroup, count, sum } from '@/lib/query';
import { t as tr } from '@/lib/i18nCore';
import { PARCEL_LEFT } from '@/lib/services';
import { text } from '@/lib/format';

export type LandStatus = {
  /** Нийт нэгж талбар (бүх төлөв, хоосон Tuluv орно) */
  total: number;
  /** Нийт талбай, м² */
  areaM2: number;
  cleared: number;
  cleaned: number;
  remaining: number;
  /** Бүрэн чөлөөлсөн + цэвэрлэсэн */
  resolved: number;
  /** resolved ÷ total × 100 (0 хуваарьт null) */
  pct: number | null;
  /** Төлөв бүрийн тоо — жагсаалтад байгаа дарааллаар нь */
  byStatus: { label: string; n: number; areaM2: number }[];
  /** ҮЛДСЭН талбарын шалтгаан (`явцын_мэдээ`) — тоогоор буурах эрэмбээр */
  reasons: { label: string; n: number }[];
};

let cache: Promise<LandStatus> | null = null;

/** Шалтгааны нэрийг Gazar-тай ИЖИЛ дүрмээр цэвэрлэнэ (арын зай, төгсгөлийн «.») */
const cleanReason = (v: unknown): string => {
  const s = text(v).trim().replace(/\.$/, '').trim();
  return !s || s === '—' ? tr('Тодорхойгүй') : s;
};

/** Нэг удаа татаад кэшлэнэ — олон дашбоард зэрэг дуудахад нэг л багц хүсэлт явна */
export function loadLandStatus(): Promise<LandStatus> {
  if (!cache) {
    const L = PARCEL_LEFT;
    cache = Promise.all([
      queryGroup(
        L.url,
        L.fields.status,
        [count('OBJECTID', 'n'), sum(L.fields.area, 'a')],
      ),
      /**
       * ⚠️ `areaAlt` НӨХӨЛТ: `area_m2` (кадастр) хоосон ч гараар бичсэн `Талбай`
       * утгатай мөрүүд бий (2026-08: 9 мөр, 4,328 м²) — эдгээрийг алгасвал
       * «Нийт талбай» дутуу гарна (services.ts-ийн `areaAlt`-ийн амлалт).
       * Эдгээр FeatureServer outStatistics-т SQL илэрхийлэл (COALESCE) авдаггүй
       * тул тусдаа асуулгаар татаж клиент талд нэмнэ.
       */
      queryGroup(
        L.url,
        L.fields.status,
        [sum(L.fields.areaAlt, 'a')],
        `${L.fields.area} IS NULL AND ${L.fields.areaAlt} IS NOT NULL`,
      ),
      queryGroup(
        L.url,
        L.fields.progress,
        [count('OBJECTID', 'n')],
        `${L.fields.status}='Үлдсэн нэгж талбар'`,
      ),
    ]).then(([statusRows, altRows, reasonRows]) => {
      const byStatus = statusRows.map((r) => ({
        /**
         * ⚠️ `text(v, '')` — анхдагч «—» БОЛОХГҮЙ. `text()`-ийн анхдагч нь «—»
         * тул `|| 'Тодорхойгүй'` салаа ХЭЗЭЭ Ч ажиллахгүй байв (энэ мөрөнд
         * ямар ч хоосон утга «—» болж гарна). Хуучин үйлчилгээнд хоосон `Tuluv`
         * байгаагүй тул нуугдаж байсныг `selbe_parcel_last0731` (1 хоосон мөр)
         * ил гаргав. Шошго нь давхаргын `paint.emptyLabel`-тай нэг байх ёстой.
         */
        label: text(r[L.fields.status], '').trim() || tr('Тодорхойгүй'),
        n: Number(r.n ?? 0),
        areaM2: Number(r.a ?? 0),
      }));
      // `areaAlt` нөхөлт — area_m2 хоосон мөрийн гараар бичсэн талбайг харгалзах
      // төлөвт нь нэмнэ (нийт `areaM2` byStatus-аас нийлдэг тул мөн нөхөгдөнө)
      for (const r of altRows) {
        const label = text(r[L.fields.status], '').trim() || tr('Тодорхойгүй');
        const g = byStatus.find((x) => x.label === label);
        if (g) g.areaM2 += Number(r.a ?? 0);
      }
      const of = (v: string) => byStatus.find((x) => x.label === v)?.n ?? 0;
      const total = byStatus.reduce((s, x) => s + x.n, 0);
      const areaM2 = byStatus.reduce((s, x) => s + x.areaM2, 0);
      /**
       * ⚠️ ТҮҮХИЙ утгаар жишнэ — `tr()` ХЭРЭГЛЭХГҮЙ. `byStatus.label` нь
       * үйлчилгээний түүхий монгол утга тул EN хэлэнд `tr()`-ээр орчуулсан
       * түлхүүр («Fully acquired» г.м.) хэзээ ч таарахгүй, чөлөөлөлт 0%
       * гардаг байв. `tr()` зөвхөн ДЭЛГЭЦИЙН текстэд (loadClearance-ийн загвар).
       */
      const cleared = of('Бүрэн чөлөөлсөн');
      const cleaned = of('Цэвэрлэсэн нэгж талбар');
      const remaining = of('Үлдсэн нэгж талбар');
      const resolved = cleared + cleaned;

      const rmap = new Map<string, number>();
      for (const r of reasonRows) {
        const k = cleanReason(r[L.fields.progress]);
        rmap.set(k, (rmap.get(k) ?? 0) + Number(r.n ?? 0));
      }
      const reasons = [...rmap.entries()]
        .map(([label, n]) => ({ label, n }))
        .sort((a, b) => b.n - a.n);

      return {
        total, areaM2, cleared, cleaned, remaining, resolved,
        pct: total ? (resolved / total) * 100 : null,
        byStatus,
        reasons,
      };
    });
    // Амжилтгүй амлалтыг кэшлэхгүй — «дахин оролдох» сэргэх боломжтой байг
    cache.catch(() => { cache = null; });
  }
  return cache;
}
