'use client';

/**
 * ГУРВАН ТҮВШНИЙ ҮНЭЛГЭЭ — супер хэрэглэгчийн нүүр самбарын нэмэлт KPI-үүдийн
 * өгөгдөл (2026-08-21, хэрэглэгчийн хүсэлт). Гурван эх сурвалж:
 *
 *   1. ОБЬЁМЫН ЗӨРҮҮ — «Гүйцэтгэл бөглөх» хуудасны 12 багцын хүснэгтээс:
 *      мөрийн төлөвлөгдсөн Обьём vs блокуудад бөглөсөн обьёмын нийлбэр.
 *      Зөрүүг НЭГЖ ӨРТӨГ-т үржүүлж мөнгөн дүнгээр үнэлнэ.
 *   2. ДАВХЦСАН ҮЛДСЭН НЭГЖ ТАЛБАР — БҮХ багц ажлаар (барилгын блок + дэд
 *      бүтэц + нийгмийн барилгын давхаргууд), нэрийн хамт. Ажил эхлүүлэхэд
 *      саад болж буй газар.
 *   3. ХАБЭА-ГИЙН ХОХИРОЛ — ослын бүртгэлээс хохирлын төрлийн тохиолдлууд.
 */

import { queryFeatures } from './query';
import { loadCodedMaps, codedName } from './codedDomain';
import { cached, SESSION_TTL_MS } from './live';
import { BUILDING, HABEA, PKG_BY_BAGTS, LAYER_BY_ID } from './services';
import { overlapLeftParcels } from './parcelOverlap';
import { t as tr } from './i18nCore';
import { PKGS, fillSchema } from '@/modules/sheet/bagts.pkg';
import { loadSheetShared } from './sheetShared';

/* ══════════════ 1. Обьёмын зөрүү (Гүйцэтгэлийн хяналт) ══════════════ */

export type VarianceWork = {
  /**
   * БАГЦЫН БҮЛЭГ — «Багц 1» (`Pkg.group`).
   */
  pkg: string;
  /** Бөглөх хуудасны нэр — «Багц 1 · 9 давхар» (`Pkg.label`) */
  sheet: string;
  /**
   * Мөрийн дугаар (хуудасны «№» багана) — ажлын нэр ХАНГАЛТГҮЙ түлхүүр.
   */
  no: string;
  work: string;
  /** Төлөвлөгдсөн Обьём — БҮХ блокийн (мөрийн «Обьём» × блокийн тоо; блокгүй багцад мөрийн «Обьём») */
  vol: number;
  /** Блокуудад бөглөсөн обьёмын нийлбэр — бодит гүйцэтгэлийн утга */
  sum: number;
  /**
   * Хэтрэлт — БЛОК БҮРЭЭР: Σ max(0, блокийн обьём − мөрийн «Обьём»).
   */
  over?: number;
  /** Нэгж өртөг, ₮ */
  unit: number;
  /** Зөрүүгийн мөнгөн дүн = хэтрэлт × нэгж өртөг, ₮ */
  mnt: number;
};

export type Variance = {
  /** Зөрүүтэй (хэтэрсэн) ажлын тоо */
  works: number;
  /** Нийт зөрүүгийн мөнгөн дүн, ₮ */
  totalMnt: number;
  /** Хамгийн том зөрүүтэй ажлууд — буурах эрэмбээр, дээд 8 */
  top: VarianceWork[];
  /**
   * БҮХ зөрүүтэй ажил — буурах эрэмбээр.
   */
  all: VarianceWork[];
  /** Уншиж чадаагүй багцын тоо (үйлчилгээ унасан г.м.) */
  failedPkgs: number;
  /**
   * ХЭМЖИГДЭХ багцын тоо — обьёмын баганатай (блоктой) + уншигдаагүй.
   */
  measurable?: number;
};

export const loadVariance: () => Promise<Variance> = cached(
  async (): Promise<Variance> => {
    const results = await Promise.allSettled(PKGS.map(async (pkg) => {
      const sc = await fillSchema(pkg);
      /* Обьёмын багана алга (блокгүй · `obyem_sum` талбаргүй) — хэмжигдэхгүй (`null`). */
      if (!sc.obyem.some(Boolean)) return null;
      /* Зөвхөн зөрүү бодоход хэрэгтэй талбарууд — бүтэн «*» татахад мөр ~60+
         баганатай, 10 багц ~10-20МБ JSON болдог (2026-08-21 аудит). */
      const { rows } = await loadSheetShared(pkg, 'variance');
      const out: VarianceWork[] = [];
      for (const r of rows) {
        // Зөвхөн НАВЧ ажил — бүлгийн мөр нь нэгтгэл тул давхар тоологдоно
        if (r.group || r.vol == null || r.vol <= 0 || r.unit == null || r.unit <= 0) continue;
        const sum = r.obyem.reduce<number>((a, v) => a + (v ?? 0), 0);
        const over = r.obyem.reduce<number>((a, v) => a + Math.max(0, (v ?? 0) - r.vol!), 0);
        if (over <= Math.max(1e-9, Math.abs(r.vol) * 1e-9)) continue;
        out.push({
          pkg: pkg.group, sheet: pkg.label, no: String(r.no ?? ''), work: r.work, vol: r.vol * Math.max(1, r.obyem.length), sum,
          over, unit: r.unit, mnt: over * r.unit,
        });
      }
      return out;
    }));
    const ok = results.filter((x): x is PromiseFulfilledResult<VarianceWork[] | null> => x.status === 'fulfilled');
    const measured = ok.filter((x) => x.value != null).length;
    const all = ok.flatMap((x) => x.value ?? []).sort((a, b) => b.mnt - a.mnt);
    return {
      works: all.length,
      totalMnt: all.reduce((s, w) => s + w.mnt, 0),
      top: all.slice(0, 8),
      all,
      failedPkgs: results.length - ok.length,
      measurable: measured + (results.length - ok.length),
    };
  },
  SESSION_TTL_MS,
  ['BAGTS_SHEET'],
  (v) => v.failedPkgs === 0,
);

/**
 * Зөрүүгийн мөнгөн дүнгийн босго, ₮.
 */
export const VAR_BAD_MNT = 100_000_000;

/* ══════════════ 2. Давхцсан үлдсэн нэгж талбар — багцаар ══════════════ */

export type PkgOverlap = { name: string; parcels: number };
export type Overlaps = {
  /** ДАВХАРДАЛГҮЙ нийт (нэг талбар хоёр багцтай давхцаж болно) */
  total: number;
  /** Багц тус бүрээр — талбартай нь л, буурах эрэмбээр */
  byPkg: PkgOverlap[];
  /**
   * ТАТАГДААГҮЙ огтлолцлын ажлын тоо (бүхэлдээ унасан ажил + давхарга нь
   * хэсэгчлэн унасан ажил). Байхгүй бол бүрэн тоологдсон.
   */
  failed?: number;
};

/**
 * Багц ажлын НЭР — давхаргын гарчгуудын нийтлэг эхлэлээр (Bagts-ийн
 * `commonName`-тэй ижил дүрэм): «Багц 6.5 · ХТП/РП А хэсэг — трасс» +
 * «… — цэг» → «Багц 6.5 · ХТП/РП А хэсэг».
 */
const commonName = (titles: string[]): string => {
  let p = titles[0] ?? '';
  for (const t of titles.slice(1)) {
    let i = 0;
    while (i < p.length && i < t.length && p[i] === t[i]) i += 1;
    p = p.slice(0, i);
  }
  return p.replace(/[\s·—-]+$/u, '').trim() || titles[0] || '';
};

export const loadOverlaps: () => Promise<Overlaps> = cached(
  async (): Promise<Overlaps> => {
    // ── Барилгын блокуудыг багцаар нь бүлэглэнэ ──
    const rows = await queryFeatures(BUILDING.url, {
      outFields: [BUILDING.oid, BUILDING.fields.bagts],
    });
    const by = new Map<string, number[]>();
    for (const r of rows) {
      const name = String(r[BUILDING.fields.bagts] ?? '').trim();
      if (!name) continue;
      const oid = Number(r[BUILDING.oid]);
      if (!Number.isFinite(oid)) continue;
      const arr = by.get(name);
      if (arr) arr.push(oid); else by.set(name, [oid]);
    }
    type Job = { name: string; srcs: { layerId: string; where: string | null }[] };
    const jobs: Job[] = [...by.entries()].map(([name, oids]) => ({
      name,
      srcs: [{ layerId: 'mon:building', where: `${BUILDING.oid} IN (${oids.join(',')})` }],
    }));
    /**
     * ── ДЭД БҮТЭЦ БА НИЙГМИЙН БАГЦУУД (2026-08-21, хэрэглэгчийн хүсэлт) ──
     * Урьд нь зөвхөн барилгын блокоор тоолж байсан тул шугам хоолой, зам,
     * сургууль зэрэг дээрх саад ОГТ харагддаггүй байв. `PKG_BY_BAGTS` нь
     * PKG_TABLE-ийн бүх багцын (дэд бүтэц + нийгмийн) давхаргуудыг агуулна.
     */
    for (const key of Object.keys(PKG_BY_BAGTS)) {
      const layerIds = (PKG_BY_BAGTS[key] ?? []).filter((id) => LAYER_BY_ID[id]);
      if (!layerIds.length) continue;
      jobs.push({
        name: commonName(layerIds.map((id) => LAYER_BY_ID[id].title)),
        srcs: layerIds.map((id) => ({ layerId: id, where: null })),
      });
    }
    // Багц бүрд орон зайн огтлолцол — зэрэг, унасан багц бусдыг унагахгүй.
    const settled = await Promise.allSettled(jobs.map(async (j) => {
      const r = await overlapLeftParcels(j.srcs);
      return { name: j.name, oids: r.oids, partial: (r.failed?.length ?? 0) > 0 };
    }));
    const okJobs = settled
      .filter((x): x is PromiseFulfilledResult<{ name: string; oids: number[]; partial: boolean }> => x.status === 'fulfilled')
      .map((x) => x.value);
    let failed = (settled.length - okJobs.length) + okJobs.filter((j) => j.partial).length;
    const byPkg = okJobs
      .map(({ name, oids }) => ({ name, parcels: oids.length }))
      .filter((p) => p.parcels > 0)
      .sort((a, b) => b.parcels - a.parcels);
    const union = new Set<number>();
    for (const j of okJobs) for (const id of j.oids) union.add(id);
    // Багцын нэргүй блокуудын давхцал нэгдлээс гарчихгүй байхын тулд бүх
    // блокийн НЭГ ажлыг нэмнэ (нэрлэгдсэн блокуудын үр дүн үүний дэд олонлог)
    const allBld = await overlapLeftParcels([{ layerId: 'mon:building', where: null }])
      .catch(() => null);
    if (!allBld || allBld.failed?.length) failed += 1;
    for (const id of allBld?.oids ?? []) union.add(id);
    if (failed > 0 && union.size === 0) throw new Error(tr('Давхцал тооцогдсонгүй'));
    return failed > 0 ? { total: union.size, byPkg, failed } : { total: union.size, byPkg };
  },
  SESSION_TTL_MS,
  ['BUILDING', 'PARCEL_LEFT'],
  (r) => !r.failed,
);


/* ══════════════ 3. ХАБЭА — хохирлын бүртгэл ══════════════ */

export type Damage = {
  /** Хохирлын төрлийн нийт бүртгэл */
  n: number;
  /** Хамгийн сүүлийн бүртгэлийн огноо (ms) — байхгүй бол null */
  last: number | null;
  /** Багц + компаниар товчилсон жишээ (дээд 3) */
  sample: string[];
};

export const loadDamage: () => Promise<Damage> = cached(
  async (): Promise<Damage> => {
    const I = HABEA.incident.fields;
    const [rows, dom] = await Promise.all([
      queryFeatures(HABEA.incident.url, { outFields: [I.turul, I.ognoo, I.bagts, I.company] }),
      loadCodedMaps(HABEA.incident.url, [I.turul, I.company]),
    ]);
    const dmg = rows.filter((r) => /хохирол/i.test(codedName(dom[I.turul], r[I.turul])));
    const dates = dmg.map((r) => Number(r[I.ognoo])).filter((x) => Number.isFinite(x) && x > 0);
    const sample = dmg
      .sort((a, b) => Number(b[I.ognoo] ?? 0) - Number(a[I.ognoo] ?? 0))
      .slice(0, 3)
      .map((r) => [String(r[I.bagts] ?? '').trim(), codedName(dom[I.company], r[I.company])].filter(Boolean).join(' · '))
      .filter(Boolean);
    return { n: dmg.length, last: dates.length ? Math.max(...dates) : null, sample };
  },
  SESSION_TTL_MS,
  ['HABEA'],
);

/**
 * Хохирлын босго. 0 → Сайн; 1–2 → Дунд; ≥3 → Яаралтай. Мөнгөн дүнгийн талбар
 * Survey123 маягтад байхгүй тул ТООГООР үнэлнэ.
 */
export const DMG_BAD_N = 3;
