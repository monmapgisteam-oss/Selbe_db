/**
 * ГРАФИКИЙН ХЭМЖЭЭ БА ШОШГЫН БАГТААМЖ — «Санхүүжилтийн явц» (`ComboChart`) ба
 * «Гүйцэтгэлийн явц» (`ProgChart`) хоёр хуваалцана. React-ийн hook нэг нь,
 * үлдсэн нь цэвэр функц.
 *
 * ⚠️ ЯАГААД (2026-09-03, зохиомжийн засвар): хоёр график нь 1200/1600 гэсэн
 * ВИРТУАЛ өргөнтэй `viewBox`-ыг `preserveAspectRatio="none"`-оор бодит өргөн
 * рүү сунгадаг байв. Ийм сунгалт нь зөвхөн шугамыг биш ҮСГИЙГ ч гажуудуулна:
 * 1,300px дэлгэц дээр 1,600 нэгжийн виртуал өргөн нь 0.81 дахин ХЭВТЭЭГЭЭР
 * ШАХАГДАЖ, «1,176,410,780,272» гэсэн бүтэн мөнгөн дүн нарийсаад уншигдахаа
 * больдог (`vectorEffect="non-scaling-stroke"` нь зөвхөн зураасыг аварна,
 * текстэд үйлчлэхгүй). Бодит өргөнийг ХЭМЖИЖ `viewBox`-д өгснөөр 1 нэгж = 1px
 * болж гажилт бүрмөсөн алга болно — мөн бүх padding·зай нь жинхэнэ пиксел
 * болох тул шошгын мөргөлдөөнийг ч тооцоолж болно.
 */
import { useEffect, useState, type RefObject } from 'react';

/**
 * Бүрхүүлийн БОДИТ өргөн (px). Хэмжигдэх хүртэл `fallback` буцаана.
 *
 * ⚠️ Эхний рендерт сервер ба хөтөч ХОЁУЛАА `fallback`-ийг хэрэглэнэ —
 *    hydration зөрөхгүй; хэмжилт нь зөвхөн дараагийн кадрт ирнэ.
 */
export function useChartWidth(ref: RefObject<HTMLElement | null>, fallback: number): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    /* ⚠️ Гараар нэмэлт хэмжилт хийхгүй: `ResizeObserver` нь ажиглаж эхэлмэгц
       эхний дуудлагаа өөрөө өгдөг тул эффектийн биед `setState` дуудахгүй. */
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w > 0 ? w : fallback;
}

/**
 * Тоон шошгын ОЙРОЛЦООГООР өргөн (px).
 *
 * ⚠️ `font-variant-numeric: tabular-nums` тул тоо бүр ИЖИЛ өргөнтэй —
 *    тэмдэгтийн тоогоор шугаман тооцоолж болно. 0.62em нь энэ хоёр графикийн
 *    шошгонд (`.ptVal`, `.progVal` — 10px, 600 жин) хэмжилтээр таарсан коэф.
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
 * ⚠️ ЯАГААД (2026-09-03): «Санхүүжилтийн явц» дээр шошгын алхам нь
 * `ceil(N/8)`-аар бодогддог байсан бөгөөд дээрээс нь СҮҮЛИЙН цэг үргэлж
 * нэмэгддэг байв. N=12 үед алхам 2 болж, 10-р ба 11-р цэг ЗЭРЭГЦЭЭ хоёулаа
 * шошготой болно: 17 оронтой мөнгөн дүн ~105px эзэлдэг атлаа хоёр цэгийн
 * хооронд ердөө ~104px байдаг тул «305,106,471,202 305,106,471,202» гэж
 * дээр дээрээсээ давхарлан бичигддэг байлаа (хэрэглэгчийн дэлгэцийн зураг).
 *
 * ⚠️ Мөнгөн дүнг ТОВЧЛОХ нь хориотой (репогийн дүрэм) тул шошгыг богиносгож
 * шийдэх боломжгүй — ТООГ нь цөөрүүлж шийднэ. Эхэн ба төгсгөл нь үргэлж
 * үлдэх тул «зөвхөн эцсийн утга» гэсэн хориотой зан руу ч эргэхгүй.
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
