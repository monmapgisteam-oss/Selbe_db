'use client';

/**
 * ДУРЫН ХҮСНЭГТИЙГ баганын өргөнөөр чирж тохируулдаг болгоно.
 *
 *   <ResizableTable storeKey="tailan.bagts" className={r.table}>
 *     <thead>…</thead><tbody>…</tbody>
 *   </ResizableTable>
 *
 * `<table>`-ыг ингэж солиход л хангалттай — нүд бүрийг гар аргаар өөрчлөх
 * шаардлагагүй. Өргөн нь баганын ДУГААРААР (`--cw-1`, `--cw-2`…) бүрхүүл дээр
 * бичигдэж, CSS-ийн `nth-child` дүрэм түүнийг уншина.
 *
 * ⚠️ Бариулуудыг `<th>` дотор БИШ, ТУСДАА давхаргад байрлуулав. React-ийн
 *    удирддаг элемент рүү DOM хүүхэд шургуулбал дараагийн зурагт алга болно.
 *    Давхарга нь толгойн нүдний ирмэгүүдийг ХЭМЖИЖ байрлана.
 *
 * ⚠️ Чирэх явцад React-ийн төлөв ХӨДӨЛӨХГҮЙ — зөвхөн CSS хувьсагчийг шууд
 *    бичнэ. Тайлангийн зарим хүснэгт хэдэн зуун мөртэй тул хөдөлгөөн бүрд
 *    дахин зурвал бариул гацна. Төлөв ба localStorage-д `pointerup` дээр л
 *    нэг удаа буулгана.
 *
 * ⚠️ `sheet` модулийн `useColWidths`-ээс ЯЛГААТАЙ: тэр нь баганын СЕМАНТИК
 *    ангиллаар (`--w-ajil`) ажилладаг бөгөөд давтагдах барилгын багануудыг нэг
 *    дор өөрчилдөг — тэр хуудасны бүтцэд зориулагдсан. Энэ нь дурын хүснэгтэд
 *    наалддаг ерөнхий хувилбар.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import st from './resizableTable.module.css';

/** Багана уншигдахгүй нарийсахаас сэргийлнэ. */
const MIN_W = 36;
const LS = 'selbe.tblw.';

type Widths = Record<number, number>;

type Props = {
  /** localStorage-ийн түлхүүр. Хүснэгт бүрд ӨӨР байх ёстой. */
  storeKey: string;
  className?: string;
  children: React.ReactNode;
};

export function ResizableTable({ storeKey, className, children }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<Widths>({});
  /** Бариул бүрийн ЗҮҮН байрлал (px) — толгойн нүднүүдийг хэмжиж гаргана. */
  const [edges, setEdges] = useState<number[]>([]);
  /** Толгойн өндөр — бариул зөвхөн түүгээр сунана (мөрийн доогуур биш). */
  const [headH, setHeadH] = useState(0);

  // ⚠️ localStorage-ийг ЭФФЕКТЭД уншина — эхний зурагт серверийнхтэй ижил
  // байхгүй бол hydration зөрнө.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS + storeKey);
      if (raw) setW(JSON.parse(raw) as Widths);
    } catch {
      /* хадгалалт байхгүй/эвдэрсэн — анхны өргөнөөр */
    }
  }, [storeKey]);

  const save = useCallback(
    (next: Widths) => {
      try {
        localStorage.setItem(LS + storeKey, JSON.stringify(next));
      } catch {
        /* хувийн горимд бичих боломжгүй — зөвхөн энэ сешнд үйлчилнэ */
      }
    },
    [storeKey],
  );

  // ⚠️ Хадгалахдаа ЭНД-ээс уншина: `setW(p => { save(p); … })` гэвэл state-ийн
  // шинэчлэгч цэвэр биш болж StrictMode-д хоёр дахин ажиллана.
  const cur = useRef<Widths>({});
  cur.current = w;

  /** Толгойн нүднүүдийн баруун ирмэгийг хэмжиж бариулын байрлалыг шинэчилнэ. */
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const ths = wrap?.querySelectorAll<HTMLTableCellElement>('thead tr:last-child > th');
    if (!wrap || !ths?.length) return;
    const base = wrap.getBoundingClientRect().left;
    const next: number[] = [];
    ths.forEach((th) => {
      const r = th.getBoundingClientRect();
      next.push(Math.round(r.right - base));
    });
    setEdges((p) =>
      p.length === next.length && p.every((v, i) => v === next[i]) ? p : next,
    );
    const head = wrap.querySelector('thead');
    const h = head ? Math.round(head.getBoundingClientRect().height) : 0;
    setHeadH((p) => (p === h ? p : h));
  }, []);

  // Агуулга/өргөн өөрчлөгдөхөд ирмэгүүд шилжинэ — ажиглаж дагана.
  useLayoutEffect(() => {
    measure();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [measure, children]);

  const drag = useRef<{ i: number; x: number; w: number; px?: number } | null>(null);

  const onDown = (i: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const wrap = wrapRef.current;
    const th = wrap?.querySelectorAll<HTMLTableCellElement>(
      'thead tr:last-child > th',
    )[i];
    const w0 = th ? th.getBoundingClientRect().width : MIN_W;
    drag.current = { i, x: e.clientX, w: w0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.dataset.drag = '1';
    document.body.classList.add(st.dragging);
    // ⚠️ Чирч эхлэх мөчид БҮХ баганын одоогийн өргөнийг тогтооно. `fixed`
    //    байрлуулалт руу шилжихэд бусад багана нь агуулгаараа биш, харагдаж
    //    байсан өргөнөөрөө үлдэх ёстой — эс бөгөөс хүснэгт бүхэлдээ үсэрнэ.
    if (wrap && !wrap.style.getPropertyValue('--cw-1')) {
      wrap
        .querySelectorAll<HTMLTableCellElement>('thead tr:last-child > th')
        .forEach((cell, k) => {
          if (cur.current[k] == null)
            wrap.style.setProperty(
              `--cw-${k + 1}`,
              `${Math.round(cell.getBoundingClientRect().width)}px`,
            );
        });
    }
  };

  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const px = Math.max(MIN_W, Math.round(d.w + (e.clientX - d.x)));
    if (px === d.px) return;
    d.px = px;
    wrapRef.current?.style.setProperty(`--cw-${d.i + 1}`, `${px}px`);
  };

  const finish = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    delete e.currentTarget.dataset.drag;
    document.body.classList.remove(st.dragging);
    if (d.px == null) return; // хөдөлгөөнгүй товшилт — өөрчлөлт алга
    // Чирэх мөчид тогтоосон бусад баганын өргөнийг ч хамт хадгална.
    const wrap = wrapRef.current;
    const next: Widths = { ...cur.current, [d.i]: d.px };
    wrap
      ?.querySelectorAll<HTMLTableCellElement>('thead tr:last-child > th')
      .forEach((cell, k) => {
        if (next[k] == null)
          next[k] = Math.round(cell.getBoundingClientRect().width);
      });
    setW(next);
    save(next);
    measure();
  };

  /** Бүх баганыг анхны өргөнд нь буцаана (бариул дээр давхар товшилт). */
  const reset = () => {
    const wrap = wrapRef.current;
    for (let k = 1; k <= 24; k++) wrap?.style.removeProperty(`--cw-${k}`);
    setW({});
    save({});
    measure();
  };

  const bump = (i: number, delta: number) => {
    const wrap = wrapRef.current;
    const th = wrap?.querySelectorAll<HTMLTableCellElement>(
      'thead tr:last-child > th',
    )[i];
    const base =
      cur.current[i] ?? (th ? Math.round(th.getBoundingClientRect().width) : MIN_W);
    const next = { ...cur.current, [i]: Math.max(MIN_W, base + delta) };
    setW(next);
    save(next);
  };

  const style = Object.fromEntries(
    Object.entries(w).map(([k, v]) => [`--cw-${Number(k) + 1}`, `${v}px`]),
  ) as React.CSSProperties;

  const sized = Object.keys(w).length > 0;
  /** Баганын тоо — толгойгоос хэмжигдсэн (эхний зурагт 0, дараа нь бодит). */
  const cols = edges.length;

  return (
    <div
      ref={wrapRef}
      className={`${st.wrap}${sized ? ` ${st.fixed}` : ''}`}
      style={style}
    >
      <table className={className}>
        {/* ⚠️ Өргөнийг `<col>`-оор өгнө, CSS-ийн `nth-child` жагсаалтаар БИШ:
            Санхүүжилтийн хүснэгт баганаа ӨГӨГДЛӨӨС үүсгэдэг тул 256 багана
            хүрч болно. Жагсаалт нь зайлшгүй хязгаартай бөгөөд хэтэрсэн
            багана нь чирэгдэх мэт харагдаад ҮНЭНДЭЭ хөдөлдөггүй байв.
            `<col>` нь хүснэгтийн стандарт механизм — хязгааргүй. */}
        {cols > 0 && (
          <colgroup>
            {Array.from({ length: cols }, (_, i) => (
              <col key={i} style={{ width: `var(--cw-${i + 1})` }} />
            ))}
          </colgroup>
        )}
        {children}
      </table>
      {/* Бариулууд — толгойн нүдний баруун ирмэг бүр дээр. Хамгийн сүүлийнхийг
          орхив: түүнийг чирэхэд хүснэгтийн гаднах зайг л сунгана. */}
      <div className={st.grips} aria-hidden={false}>
        {edges.slice(0, -1).map((x, i) => (
          <button
            key={i}
            type="button"
            className={st.grip}
            style={{ left: x, height: headH }}
            title="Чирж өргөнийг тохируулна · давхар товшвол анхны хэмжээ"
            aria-label="Баганы өргөн"
            role="separator"
            aria-orientation="vertical"
            onPointerDown={onDown(i)}
            onPointerMove={onMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onDoubleClick={reset}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowLeft' ? -8 : e.key === 'ArrowRight' ? 8 : 0;
              if (d) {
                e.preventDefault();
                bump(i, d);
              } else if (e.key === 'Enter' || e.key === 'Home') {
                e.preventDefault();
                reset();
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
