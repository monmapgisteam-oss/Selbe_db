/**
 * ГРАФИКИЙН ХЭМЖЭЭ БА ШОШГЫН БАГТААМЖ — «Санхүүжилтийн явц» (`ComboChart`) ба
 * «Гүйцэтгэлийн явц» (`ProgChart`) хоёр хуваалцана. React-ийн hook нэг нь,
 * үлдсэн нь цэвэр функц.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Бүрхүүлийн БОДИТ өргөн (px). Хэмжигдэх хүртэл `fallback` буцаана.
 */
export function useChartWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [w, setW] = useState(0);
  const obs = useRef<{ el: HTMLElement; ro: ResizeObserver } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (obs.current?.el === el) return;
    obs.current?.ro.disconnect();
    obs.current = null;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    obs.current = { el, ro };
  });
  /* unmount — ажиглалтыг салгана */
  useEffect(() => () => { obs.current?.ro.disconnect(); obs.current = null; }, []);
  return w > 0 ? w : fallback;
}

/**
 * Тоон шошгын ОЙРОЛЦООГООР өргөн (px).
 */
export const textW = (s: string, px = 10): number => s.length * px * 0.62;

export type LabelSpot = {
  /** Мөрийн индекс */
  i: number;
  /** Шошгын төв/зах (`anchor`-оос хамаарна), px */
  x: number;
  /** Текстийн өргөн, px */
  w: number;
  anchor: 'start' | 'middle' | 'end';
};

/** Шошгын эзлэх хэвтээ завсар */
function span(s: LabelSpot): [number, number] {
  if (s.anchor === 'start') return [s.x, s.x + s.w];
  if (s.anchor === 'end') return [s.x - s.w, s.x];
  return [s.x - s.w / 2, s.x + s.w / 2];
}

/**
 * МӨРГӨЛДӨХГҮЙ ШОШГУУДЫГ сонгоно — эзэмших эрэмбэ: ТӨГСГӨЛ → ЭХЛЭЛ → бусад.
 *
 * @param gap шошго хоорондын хамгийн бага зай (px)
 * @returns үлдсэн шошгын индексүүд, ӨСӨХ дарааллаар
 */
export function fitLabels(spots: LabelSpot[], gap = 8): number[] {
  if (spots.length <= 1) return spots.map((s) => s.i);
  const kept: LabelSpot[] = [];
  const free = (s: LabelSpot) => {
    const [a, b] = span(s);
    return kept.every((k) => {
      const [ka, kb] = span(k);
      return b + gap <= ka || a - gap >= kb;
    });
  };
  /* 1. Төгсгөл — график юугаараа дууссаныг хэлдэг хамгийн чухал цэг */
  kept.push(spots[spots.length - 1]);
  /* 2. Эхлэл — хаанаас эхэлснийг хэлнэ (мөргөлдвөл ч эрхээ алдахгүй) */
  if (spots.length > 1 && free(spots[0])) kept.push(spots[0]);
  /* 3. Дундынхыг ЗҮҮНЭЭС баруун тийш — багтсаныг нь л */
  for (let k = 1; k < spots.length - 1; k++) if (free(spots[k])) kept.push(spots[k]);
  return kept.map((s) => s.i).sort((a, b) => a - b);
}
