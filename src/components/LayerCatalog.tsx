'use client';

import { useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { Icon } from './Icon';
import { LayerSwatch } from './LayerSwatch';
import { Data } from './ui';
import type { Async } from '@/lib/useAsync';
import type { Totals } from '@/lib/totals';
import { qtyText } from '@/lib/totals';
import { catalogGroups, LAYER_BY_ID } from '@/lib/services';
import { num } from '@/lib/format';
import s from './catalog.module.css';

/**
 * ДАВХАРГЫН КАТАЛОГ — «Ерөнхий мэдээлэл» дарахад зүүн модны ХАЖУУД нээгдэх багана.
 *
 * ⚠️ Урьд нь модал popup байв. Popup нь зураг ба самбарыг бүрхдэг тул давхарга
 * асаах бүрд «юу өөрчлөгдсөнийг» харахын тулд хаах шаардлагатай болдог байлаа.
 * Багана болгосноор чагт дарах бүрд зурагт өөрчлөлт ШУУД харагдана.
 *
 * ⚠️ Тоо, өртгийг ЭНД дахин татахгүй: `totals`-ыг `Portal` нэг удаа дуудаж
 * дамжуулна — самбарын дүнтэй зөрөх боломжгүй байх ёстой.
 *
 * Мөр бүр ХОЁР үйлдэлтэй:
 *   · чагт — зурагт харуулах/нуух (багана нээлттэй хэвээр)
 *   · нэр  — баруун самбарт тэр давхаргын дашбоард нээгдэнэ
 */
export function LayerCatalog({
  view,
  totals,
  visible,
  setVisible,
  selected,
  onSelect,
  onClose,
  zone,
}: {
  /**
   * Аль харагдацын каталог вэ.
   * ⚠️ «Барилгын хяналт»-д хяналтын багц ЭХЭНД, дараа нь ЕТ-ийн багцууд —
   * тэнд гүйцэтгэлийн давхарга дээр контекст нэмэх нь ердийн хэрэглээ.
   */
  view: 'plan' | 'monitor';
  totals: Async<Map<string, Totals>>;
  visible: string[];
  setVisible: Dispatch<SetStateAction<string[]>>;
  selected: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  zone: string | null;
}) {
  const groups = catalogGroups(view);

  /**
   * Хураасан багцууд.
   * ⚠️ 29+ давхарга задгай байвал багана 2–3 дэлгэц болж, доод талын багц
   * гүйлгэхгүйгээр огт харагдахгүй. Тиймээс багц бүрийг хураах боломжтой;
   * эхлэхэд БҮГД задгай — юу байгааг эхлээд харуулна.
   */
  const [shut, setShut] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) =>
    setVisible((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /** Багц бүхэлдээ — нэг ч асаагүй бол бүгдийг асаана, эс бөгөөс бүгдийг унтраана */
  const toggleGroup = (ids: string[]) =>
    setVisible((prev) =>
      ids.every((id) => !prev.includes(id))
        ? [...prev, ...ids.filter((id) => !prev.includes(id))]
        : prev.filter((id) => !ids.includes(id)),
    );

  const all = groups.flatMap((g) => g.ids);
  const onCount = visible.filter((id) => all.includes(id)).length;

  return (
    <aside className={s.drawer} aria-label="Давхаргын жагсаалт">
      <header className={s.head}>
        <div className={s.headText}>
          <span className={s.title}>Давхарга</span>
          <span className={s.sub}>
            {num(all.length)} нийт · {num(onCount)} асаалттай
            {zone && <> · {zone}</>}
          </span>
        </div>
        <button
          type="button"
          className={s.close}
          onClick={() => setShut(shut.size ? new Set() : new Set(groups.map((g) => g.key)))}
          title={shut.size ? 'Бүгдийг дэлгэх' : 'Бүгдийг хураах'}
          aria-label={shut.size ? 'Бүгдийг дэлгэх' : 'Бүгдийг хураах'}
        >
          {shut.size ? '▸' : '▾'}
        </button>
        <button type="button" className={s.close} onClick={onClose} aria-label="Жагсаалтыг хаах">×</button>
      </header>

      <div className={s.body}>
        <Data q={totals} loading="Үзүүлэлт тооцож байна…">
          {(map) => (
            <>
              {groups.map((g) => {
                const ids = g.ids;
                const defs = ids.map((id) => LAYER_BY_ID[id]).filter(Boolean);
                const on = ids.filter((id) => visible.includes(id)).length;
                const open = !shut.has(g.key);

                return (
                  <section
                    key={g.key}
                    className={s.group}
                    style={{ '--tone': g.hue } as CSSProperties}
                  >
                    <div className={s.groupHead}>
                      {/* Гарчиг дарахад багц хураагдана/дэлгэгдэнэ */}
                      <button
                        type="button"
                        aria-expanded={open}
                        className={s.groupToggle}
                        onClick={() => {
                          const next = new Set(shut);
                          if (open) next.add(g.key); else next.delete(g.key);
                          setShut(next);
                        }}
                      >
                        <span className={s.groupIcon}><Icon name={g.icon} size={15} /></span>
                        <span className={s.groupTitle}>{g.title}</span>
                        <span className={`${s.groupCaret} ${open ? s.groupCaretOpen : ''}`} aria-hidden>▾</span>
                      </button>
                      <button
                        type="button"
                        className={s.groupBtn}
                        onClick={() => toggleGroup(ids)}
                        title={on === 0 ? 'Багцыг бүхэлд нь асаах' : 'Багцыг бүхэлд нь унтраах'}
                      >
                        {on}/{ids.length}
                      </button>
                    </div>

                    {/* ⚠️ `hidden` атрибут БОЛОХГҮЙ: `.rows`-ын `display: flex`
                        нь UA-гийн `display: none`-ыг дардаг. Нөхцөлт рендер. */}
                    {open && (
                    <div className={s.rows}>
                      {defs.map((d) => {
                        const t = map.get(d.id);
                        const isOn = visible.includes(d.id);
                        const q = t ? qtyText(d, t.q) : null;
                        return (
                          <div
                            key={d.id}
                            className={`${s.row} ${isOn ? s.rowOn : ''} ${selected === d.id ? s.rowSel : ''}`}
                            style={{ '--tone': d.hue } as CSSProperties}
                          >
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isOn}
                              aria-label={`${d.title} — зурагт харуулах`}
                              className={s.check}
                              onClick={() => toggle(d.id)}
                            >
                              <svg viewBox="0 0 12 12" width="10" height="10">
                                <path d="M2 6.2 4.6 8.8 10 3.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>

                            {/* Симбол — газрын зурагтай ижил. Тайлбарын хайрцаг
                                хассан тул өнгө↔давхаргын холбоо ЭНД байна. */}
                            <LayerSwatch d={d} />

                            <button
                              type="button"
                              aria-pressed={selected === d.id}
                              className={s.rowMain}
                              onClick={() => onSelect(d.id)}
                            >
                              <span className={s.rowTitle}>{d.title}</span>
                              <span className={`${s.rowMeta} num`}>
                                {t ? `${num(t.n)} ш` : '—'}
                                {q ? ` · ${q}` : ''}
                                {zone && d.noZone && <em className={s.rowWarn}> · бүсгүй</em>}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  </section>
                );
              })}
            </>
          )}
        </Data>
      </div>

      <p className={s.foot}>
        Чагтаар зурагт харуулна · нэр дээр дарж баруун талд дэлгэрэнгүйг нь харна.
      </p>
    </aside>
  );
}
