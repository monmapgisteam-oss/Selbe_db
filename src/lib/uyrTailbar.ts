'use client';

/**
 * «ЯАГААД ЭНД ҮЕРЛЭВ?» — нэг нүдийн ШАЛТГААНЫГ тайлбарлана.
 *
 * ══════════════════ ЯАГААД ══════════════════
 *
 * Загварчлал нь «энд 1.4 м ус байна» гэж хэлдэг ч ХЭРЭГЛЭГЧИЙН асуулт нь
 * «ЯАГААД яг энд вэ, хажуугийн гудамжинд яагаад үгүй вэ» байдаг
 * (2026-09-09-ны шүүмж: «people can't understand why this section flooded»).
 * Тэр асуултад хариулахгүй бол зураг нь итгэл төрүүлэхгүй өнгөт толбо хэвээр
 * үлдэнэ.
 *
 * Хариулт нь ГУРВАН энгийн тоонд байдаг:
 *
 *   1. РЕЛЬЕФ — энэ нүд эргэн тойрноосоо хэр НАМ вэ. Ус нам газар цуглана.
 *   2. НАЛУУ  — газар хэр хавтгай вэ. Хавтгай газар ус ЗОГСОНО; эгц газар
 *               ус зөвхөн ӨНГӨРНӨ.
 *   3. ЗАМ    — ус ХААНААС ирсэн бэ. Дээд урсгал руу нь мөрдөж үзүүлбэл
 *               «энэ гудамжаар уулаас ирсэн ус» гэдэг НЭГ ХАРАХАД ойлгогдоно.
 */

import { t as tr } from '@/lib/i18nCore';
import type { FloodData } from '@/lib/uyr';

/**
 * Урсгалын замын ДЭЭД тал нь хэдэн нүд вэ.
 */
const MAX_STEPS = 80;

/** Рельефийг хэмжих цонхны радиус (нүдээр) — ~9×9 */
const RELIEF_R = 4;

export type FloodWhy = {
  /** Эргэн тойрны дунджаас хэдэн метр НАМ вэ (эерэг = хонхор) */
  reliefM: number;
  /** Газрын налуу (%) */
  slopePct: number;
  /**
   * ГОЛЫН СУВАГ уу.
   */
  channel: boolean;
  /**
   * ХУРААХ ТАЛБАЙ (га) — ArcGIS `FlowAccumulation`. `null` = мэдэгдэхгүй.
   */
  accHa: number | null;
  /**
   * ТООЦООНЫ МУЖИД байна уу (2026-10-09, `FloodData.inDomain`).
   */
  computed: boolean;
  /** Богино, хүний хэлээр бичсэн шалтгаан */
  reason: string;
};

/** Нүдний индекс → торны x, y */
const xy = (i: number, W: number) => [i % W, (i / W) | 0] as const;

/**
 * ШАЛТГААНЫГ ТООЦНО — рельеф, налуу, суваг.
 *
 * @param s  аль зүсмэл дээр (урсгалын хурдыг эндээс уншина)
 */
export function whyFlood(fd: FloodData, s: number, idx: number): FloodWhy | null {
  const ter = fd.terrain;
  if (!ter) return null;
  const W = fd.meta.width;
  const H = fd.meta.height;
  const [x, y] = xy(idx, W);
  const dx = fd.meta.cellM;

  /* ── Рельеф: цонхны дундажтай харьцуулна ── */
  let sum = 0;
  let n = 0;
  let lo = Infinity;
  for (let j = -RELIEF_R; j <= RELIEF_R; j++) {
    for (let i2 = -RELIEF_R; i2 <= RELIEF_R; i2++) {
      const xx = x + i2;
      const yy = y + j;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const z = ter(yy * W + xx);
      sum += z;
      n++;
      if (z < lo) lo = z;
    }
  }
  const z0 = ter(idx);
  const reliefM = n ? sum / n - z0 : 0;

  /* ── Налуу: хөрш нүднүүдийн градиент ── */
  const zAt = (xx: number, yy: number) =>
    ter(Math.min(H - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx)));
  const gx = (zAt(x + 1, y) - zAt(x - 1, y)) / (2 * dx);
  const gy = (zAt(x, y + 1) - zAt(x, y - 1)) / (2 * dx);
  const slopePct = Math.hypot(gx, gy) * 100;

  /**
   * СУВАГ уу — ХОНХРООС ялгах шалгуур.
   *
   * ЯЛГАА нь ЧИГЛЭЛД: суваг нь НЭГ тэнхлэгээр эрэгтэй, НӨГӨӨГӨӨР нээлттэй
   * (ус тэр чигт үргэлжлэн урсана). Хонхор нь ХОЁУЛАНГААР нь хаалттай.
   * Тиймээс ОНЦГОЙ АЛЬ НЭГ (XOR) байх ёстой.
   */
  const bank = (a: number, b: number) => a > z0 + 0.6 && b > z0 + 0.6;
  const bankX = bank(zAt(x - 2, y), zAt(x + 2, y));
  const bankY = bank(zAt(x, y - 2), zAt(x, y + 2));
  const channel = fd.channel ? fd.channel(idx) : reliefM > 0.6 && bankX !== bankY;

  const computed = fd.inDomain ? fd.inDomain(idx) : true;
  const d = fd.depth(s, idx);
  const sp = fd.speed(s, idx);
  const acc = fd.catchHa ?? fd.accHa;
  const accHa = acc ? Math.round(acc(idx) * 10) / 10 : null;
  const catchTxt = accHa != null && accHa >= 1
    ? tr('Тооцооны мужид энэ цэг рүү дор хаяж {0} га талбайн ус цуглаж ирдэг. ', accHa.toFixed(accHa >= 10 ? 0 : 1))
    : '';
  const cause = channel
    ? tr('Голын суваг — ус энд байх нь хэвийн; эрсдэл нь эрэг давах явдал.')
    : reliefM > 0.8
      ? tr('ХОНХОР: энэ цэг эргэн тойрноосоо {0} м нам тул ус цуглана.', reliefM.toFixed(1))
      : slopePct < 2
        ? tr('ХАВТГАЙ ГАЗАР (налуу {0}%): ус урсаж гарч чадахгүй, тэнд тогтоно.', slopePct.toFixed(1))
        : sp > 1.2
          ? tr('УРСГАЛЫН ЗАМ: ус энд тогтохгүй, {0} м/с хурдтай өнгөрч байна.', sp.toFixed(1))
          : d > 0.05
            ? tr('Дээд урсгалаас ирсэн ус налуугаар ({0}%) энд дамжин урсаж байна.', slopePct.toFixed(1))
            : tr('Ус бага — энэ цэг эргэн тойрноосоо өндөр.');
  const reason = computed
    ? catchTxt + cause
    : tr('Тооцооны мужаас гадна — энэ цэгт үерийг тооцоогүй (гүн мэдэгдэхгүй, хуурай гэсэн үг БИШ).');

  return {
    reliefM: Math.round(reliefM * 100) / 100,
    slopePct: Math.round(slopePct * 10) / 10,
    channel,
    accHa,
    computed,
    reason,
  };
}

/**
 * УСНЫ ЗАМ — тухайн нүднээс ДЭЭШ (ус хаанаас ирсэн) ба ДООШ (хаашаа явна).
 *
 * @param up `true` бол урсгалын ЭСРЭГ (эх рүү), `false` бол дагуу (адаг руу)
 * @returns Web Mercator цэгүүд; 2-оос цөөн бол хоосон
 */
export function flowPath(
  fd: FloodData, s: number, idx: number, up: boolean,
): number[][] {
  const W = fd.meta.width;
  const H = fd.meta.height;
  const e = fd.meta.extent;
  const cw = (e.xmax - e.xmin) / W;
  const ch = (e.ymax - e.ymin) / H;
  const wet = fd.meta.drawM ?? fd.meta.wetM;
  const sign = up ? -1 : 1;

  let [px, py] = xy(idx, W).map((v) => v + 0.5);
  const pts: number[][] = [];
  const seen = new Set<number>();
  /** Өмнөх алхмын нүд — хагас нүдний алхам ИЖИЛ нүдэнд хоёр удаа буудаг */
  let last = -1;
  for (let k = 0; k < MAX_STEPS; k++) {
    const cx = px | 0;
    const cy = py | 0;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) break;
    const i = cy * W + cx;
    if (fd.depth(s, i) < wet) break;
    pts.push([e.xmin + px * cw, e.ymax - py * ch]);
    if (i !== last) {
      if (seen.has(i)) break;
      seen.add(i);
      last = i;
    }
    const u = fd.u(s, i);
    const v = fd.v(s, i);
    const sp = Math.hypot(u, v);
    if (sp < 0.02) break;
    px += (sign * u * 0.5) / sp;
    py -= (sign * v * 0.5) / sp;
  }
  return pts.length >= 2 ? pts : [];
}
