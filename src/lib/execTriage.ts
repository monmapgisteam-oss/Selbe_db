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
 *
 * ⚠️ Бүх ачаалалт МОДУЛИЙН ТҮВШИНД КЭШЛЭГДЭНЭ: нүүр хуудас руу буцах бүрд
 * 12 багцын хүснэгт, 7 багцын орон зайн огтлолцлыг дахин татвал ArcGIS-ийг
 * үерлэнэ. Хуудсыг бүтэн refresh хийвэл л шинэчлэгдэнэ — удирдлагын өглөөний
 * тоймд энэ нь хангалттай шинэлэг.
 */

import { queryFeatures } from './query';
import { BUILDING, HABEA, PKG_BY_BAGTS, LAYER_BY_ID } from './services';
import { overlapLeftParcels } from './parcelOverlap';
import { PKGS, loadSchema } from '@/modules/sheet/bagts.pkg';
import { loadRows } from '@/modules/sheet/bagtsSheet';

/* ══════════════ 1. Обьёмын зөрүү (Гүйцэтгэлийн хяналт) ══════════════ */

export type VarianceWork = {
  /** «Багц 1 · 9 давхар» */
  pkg: string;
  work: string;
  /** Төлөвлөгдсөн Обьём (эх хүснэгт) */
  vol: number;
  /** Блокуудад бөглөсөн обьёмын нийлбэр — бодит гүйцэтгэлийн утга */
  sum: number;
  /** Нэгж өртөг, ₮ */
  unit: number;
  /** Зөрүүгийн мөнгөн дүн = (нийлбэр − Обьём) × нэгж өртөг, ₮ */
  mnt: number;
};

export type Variance = {
  /** Зөрүүтэй (хэтэрсэн) ажлын тоо */
  works: number;
  /** Нийт зөрүүгийн мөнгөн дүн, ₮ */
  totalMnt: number;
  /** Хамгийн том зөрүүтэй ажлууд — буурах эрэмбээр, дээд 8 */
  top: VarianceWork[];
  /** Уншиж чадаагүй багцын тоо (үйлчилгээ унасан г.м.) */
  failedPkgs: number;
};

/**
 * ⚠️ ЗӨРҮҮ = зөвхөн ХЭТЭРСЭН (нийлбэр > Обьём) ажлууд. Дутуу (нийлбэр < Обьём)
 * нь «ажил дуусаагүй» гэсэн хэвийн явц тул зөрчил БИШ. Хэтэрсэн нь бодит
 * гүйцэтгэл төлөвлөгдсөн хэмжээнээс давсан — өртгийн хяналтын асуудал.
 */
let varCache: Promise<Variance> | null = null;
export function loadVariance(): Promise<Variance> {
  if (varCache) return varCache;
  varCache = (async () => {
    const results = await Promise.allSettled(PKGS.map(async (pkg) => {
      const sc = await loadSchema(pkg);
      const { rows } = await loadRows(pkg, sc);
      const out: VarianceWork[] = [];
      for (const r of rows) {
        // Зөвхөн НАВЧ ажил — бүлгийн мөр нь нэгтгэл тул давхар тоологдоно
        if (r.group || r.vol == null || r.vol <= 0 || r.unit == null || r.unit <= 0) continue;
        const sum = r.obyem.reduce<number>((a, v) => a + (v ?? 0), 0);
        if (sum <= r.vol) continue;
        out.push({
          pkg: pkg.label, work: r.work, vol: r.vol, sum,
          unit: r.unit, mnt: (sum - r.vol) * r.unit,
        });
      }
      return out;
    }));
    const ok = results.filter((x): x is PromiseFulfilledResult<VarianceWork[]> => x.status === 'fulfilled');
    const all = ok.flatMap((x) => x.value).sort((a, b) => b.mnt - a.mnt);
    return {
      works: all.length,
      totalMnt: all.reduce((s, w) => s + w.mnt, 0),
      top: all.slice(0, 8),
      failedPkgs: results.length - ok.length,
    };
  })().catch((e) => { varCache = null; throw e; });
  return varCache;
}

/**
 * Зөрүүгийн мөнгөн дүнгийн босго, ₮.
 * ⚠️ Хатуу шинжлэх ухаанч утга биш — удирдлагын анхаарал татах түвшин.
 *    Их хэмжээний зөрүү (≥100 сая ₮) нь «Яаралтай шийдвэрлэх»; бага ч гэсэн
 *    зөрүү илэрсэн бол «Дунд» (хяналт хэрэгтэй); огт байхгүй бол «Сайн».
 */
export const VAR_BAD_MNT = 100_000_000;

/* ══════════════ 2. Давхцсан үлдсэн нэгж талбар — багцаар ══════════════ */

export type PkgOverlap = { name: string; parcels: number };
export type Overlaps = {
  /** ДАВХАРДАЛГҮЙ нийт (нэг талбар хоёр багцтай давхцаж болно) */
  total: number;
  /** Багц тус бүрээр — талбартай нь л, буурах эрэмбээр */
  byPkg: PkgOverlap[];
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

let ovCache: Promise<Overlaps> | null = null;
export function loadOverlaps(): Promise<Overlaps> {
  if (ovCache) return ovCache;
  ovCache = (async () => {
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
    // Багц бүрд орон зайн огтлолцол — зэрэг, унасан багц бусдыг унагахгүй
    const settled = await Promise.allSettled(jobs.map(async (j) => ({
      name: j.name,
      parcels: (await overlapLeftParcels(j.srcs)).oids.length,
    })));
    const byPkg = settled
      .filter((x): x is PromiseFulfilledResult<PkgOverlap> => x.status === 'fulfilled')
      .map((x) => x.value)
      .filter((p) => p.parcels > 0)
      .sort((a, b) => b.parcels - a.parcels);
    // Давхардалгүй нийт — БҮХ эх сурвалжаар нэг дор (нэг талбар хоёр багцад
    // давхцсан ч нэг л удаа тоологдоно)
    const total = (await overlapLeftParcels([
      { layerId: 'mon:building', where: null },
      ...Object.values(PKG_BY_BAGTS).flat()
        .filter((id) => LAYER_BY_ID[id])
        .map((id) => ({ layerId: id, where: null })),
    ])).oids.length;
    return { total, byPkg };
  })().catch((e) => { ovCache = null; throw e; });
  return ovCache;
}

/**
 * ⚠️ 2026-08-21 (хэрэглэгчийн хүсэлт): давхцсан талбар БАЙВАЛ ШУУД «Яаралтай
 * шийдвэрлэх» — дундын түвшин байхгүй. Давхцсан газар нь тухайн багц ажлыг
 * эхлүүлэх боломжгүй гэсэн үг тул нэг ч талбар байх нь асуудал.
 */

/* ══════════════ 3. ХАБЭА — хохирлын бүртгэл ══════════════ */

export type Damage = {
  /** Хохирлын төрлийн нийт бүртгэл */
  n: number;
  /** Хамгийн сүүлийн бүртгэлийн огноо (ms) — байхгүй бол null */
  last: number | null;
  /** Багц + компаниар товчилсон жишээ (дээд 3) */
  sample: string[];
};

let dmgCache: Promise<Damage> | null = null;
export function loadDamage(): Promise<Damage> {
  if (dmgCache) return dmgCache;
  dmgCache = (async () => {
    const I = HABEA.incident.fields;
    const rows = await queryFeatures(HABEA.incident.url, {
      outFields: [I.turul, I.ognoo, I.bagts, I.company],
    });
    /**
     * ⚠️ Төрлийг ЯГ таарцаар биш, «хохирол» агуулснаар шүүнэ — Survey123-ийн
     * сонголтод «Эд хөрөнгийн хохирол» гэж байгаа ч гараар бичсэн хувилбар
     * («эд хөрөнгийн хохирол учруулсан» г.м.) алдагдах ёсгүй.
     */
    const dmg = rows.filter((r) => /хохирол/i.test(String(r[I.turul] ?? '')));
    const dates = dmg.map((r) => Number(r[I.ognoo])).filter((x) => Number.isFinite(x) && x > 0);
    const sample = dmg
      .sort((a, b) => Number(b[I.ognoo] ?? 0) - Number(a[I.ognoo] ?? 0))
      .slice(0, 3)
      .map((r) => [r[I.bagts], r[I.company]].map((v) => String(v ?? '').trim()).filter(Boolean).join(' · '))
      .filter(Boolean);
    return { n: dmg.length, last: dates.length ? Math.max(...dates) : null, sample };
  })().catch((e) => { dmgCache = null; throw e; });
  return dmgCache;
}

/**
 * Хохирлын босго. 0 → Сайн; 1–2 → Дунд; ≥3 → Яаралтай. Мөнгөн дүнгийн талбар
 * Survey123 маягтад байхгүй тул ТООГООР үнэлнэ.
 */
export const DMG_BAD_N = 3;
