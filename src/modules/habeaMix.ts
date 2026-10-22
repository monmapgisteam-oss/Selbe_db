/**
 * МОНГОЛ · ГАДААД — «Ажилтан — өдрөөр/сараар» цувааны задаргаа (ХАБЭА хуудас, 2026-10-06,
 * хэрэглэгчийн хүсэлт: «Ажилтан — өдрөөр»-ийг задаргаа орж ирсэн өдрөөс хойш хоёр муруйгаар).
 *
 * ⚠️ 2026-10-21 (аудит): `Habea.tsx`-ээс ЭНД зөөв — React/сүлжээгүй, `habeaMix.check.mjs` шууд
 *    импортлоно. Нэг компани задаргаа бөглөхөд «Нийт» муруй `null` болж, задаргаагүй компанийн
 *    ажилтан хоёр муруйгаас алга болдог (худал «уналт») байсныг `mixByDay`-д засав.
 *
 * ⚠️ `byDaySeries` (Habea.tsx)-ийн ИЖИЛ дүрэм: тайлан өгөөгүй гүйцэтгэгчийг алгасна
 *    (`companyReported`), орон нутгийн өдрийн түлхүүр (`ubDayKey`).
 */
import { t as tr } from '@/lib/i18nCore';
import type { Row } from '@/lib/query';
import type { SeriesLineDef } from '@/components/ui';
import { HABEA, laborCompanyFields } from '@/lib/services';
import { companyReported, ubDayKey } from '@/lib/ceo/workforce';

const L = HABEA.labor.fields;

/** Утга → тоо; хоосон/тоо биш бол 0 (`Habea.tsx`-ийн `nn`) — ЗӨВХӨН нийлбэрт, хэмжилтийн `null`-д биш */
const nn = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export type MixDay = { mongol: number; gadaad: number };

/**
 * ӨДӨР БҮРИЙН задаргаа — `ubDayKey` → { монгол, гадаад }.
 *
 * ⚠️ Задаргаа = тухайн өдөр ТАЙЛАН ӨГСӨН (ажилтантай) БҮХ компани монгол/гадаадаа бөглөсөн үед Л.
 *    ⚠️ 2026-10-21 (аудит): урьд нь задаргаатай компаниудыг л нийлүүлдэг тул ажилтантай атлаа
 *    задаргаагүй компанийн хүн хоёр муруйгаас алга болж («Нийт» нь задаргаатай өдөр `null`),
 *    нэг компани задаргаа бөглөхөд бусдын тоо «унасан» мэт харагдаж байв. Тийм өдөр Map-д ОРОХГҮЙ —
 *    `mixLines` түүнийг «Нийт» муруйгаар зурна (хэрэглэгч: «төрөл байхгүй бол нийтээр нь харуул»).
 *    Зөвхөн техниктэй (ажилтангүй) компани задаргаа шаардахгүй. Хоёул 0 бол тэр өдөр задаргаагүй
 *    (0 гэж зурахгүй, цоорхой).
 */
export function mixByDay(rows: readonly Row[], sfxs: readonly string[] | null): Map<string, MixDay> {
  const list = (sfxs ?? HABEA.labor.companies.map((c) => c.sfx)).map((sfx) => ({ sfx, f: laborCompanyFields(sfx) }));
  const out = new Map<string, MixDay>();
  for (const r of rows) {
    const d = nn(r[L.ognoo]);
    if (!(d > 0)) continue;
    let mongol = 0;
    let gadaad = 0;
    let unsplit = false;
    for (const { sfx, f } of list) {
      if (!companyReported(r, sfx)) continue;
      const m = nn(r[f.mongol]);
      const g = nn(r[f.gadaad]);
      /* Ажилтантай атлаа задаргаагүй — энэ өдөр задаргаагүй (дээрх ⚠️) */
      if (m + g <= 0 && nn(r[f.niitAjiltan]) > 0) { unsplit = true; break; }
      mongol += m;
      gadaad += g;
    }
    if (unsplit || mongol + gadaad <= 0) continue;
    const k = ubDayKey(d);
    const cur = out.get(k);
    if (cur) { cur.mongol += mongol; cur.gadaad += gadaad; } else out.set(k, { mongol, gadaad });
  }
  return out;
}

/**
 * Өдрийн задаргааг САР руу нэгтгэнэ (хүн-өдөр — `byMonthSeries`-ийн ижил нэгж).
 * ⚠️ Сарын ЗАРИМ өдөр задаргаагүй бол тэр сарыг задаргаатай гэж ҮЗЭХГҮЙ — Монгол +
 *    Гадаадын нийлбэр нь сарын нийт хүн-өдрөөс ДУТУУ болж, худал бууралт харагдана.
 *    Тэр сар «Нийт» муруйгаар гарна.
 */
export function mixByMonth(mix: Map<string, MixDay>, days: readonly { key: string }[]): Map<string, MixDay> {
  const partial = new Set(days.filter((x) => !mix.has(x.key)).map((x) => x.key.slice(0, 7)));
  const out = new Map<string, MixDay>();
  for (const [k, v] of mix) {
    if (partial.has(k.slice(0, 7))) continue;
    const ym = k.slice(0, 7);
    const cur = out.get(ym);
    if (cur) { cur.mongol += v.mongol; cur.gadaad += v.gadaad; } else out.set(ym, { ...v });
  }
  return out;
}

/**
 * Монгол · Гадаад хоёр муруй + задаргаагүй үед НИЙТ муруй (2026-10-06).
 *
 * ⚠️ Хэрэглэгч: «монгол гадаад төрөл байхгүй бол нийтээр нь харуул». Тиймээс
 *    цувааг ТАЙРАХГҮЙ: задаргаатай өдөр Монгол · Гадаад, задаргаагүй өдөр
 *    Нийт (одоогийн утга). Шугам бүр өөрт хамаарахгүй өдөр `null` (цоорхой).
 * ⚠️ Задаргаа огт байхгүй бол `null` — дуудагч ОДООГИЙН нэг муруйгаар зурна.
 * ⚠️ Өнгө нь «Компаниар — монгол, гадаад»-тай ИЖИЛ (`--c1` · `--c2`); Нийт нь
 *    анхдагч өгөгдлийн өнгө (`--data`) — өмнөх нэг муруйтай ижил.
 */
export function mixLines<T extends { key: string; value: number }>(
  items: readonly T[], mix: Map<string, MixDay>,
): SeriesLineDef[] | null {
  if (!mix.size || !items.some((x) => mix.has(x.key))) return null;
  const pick = (k: 'mongol' | 'gadaad') => items.map((x) => mix.get(x.key)?.[k] ?? null);
  const total = items.map((x) => (mix.has(x.key) ? null : x.value));
  const out: SeriesLineDef[] = [];
  if (total.some((v) => v != null)) {
    out.push({ key: 'all', label: tr('Нийт'), color: 'var(--data)', values: total });
  }
  out.push(
    { key: 'mn', label: tr('Монгол'), color: 'var(--c1)', values: pick('mongol') },
    { key: 'fr', label: tr('Гадаад'), color: 'var(--c2)', values: pick('gadaad') },
  );
  return out;
}
