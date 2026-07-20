'use client';

import { useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { Icon } from './Icon';
import { OVERLAY_LAYERS, type OverlayLayer } from './MapCanvas';
import { MODULES, type ModuleKey } from '@/lib/services';
import s from './overlay.module.css';

/**
 * Давхарга нэмэх — газрын зураг дээрх удирдлага.
 *
 * Үйлчилгээний давхарга ТУС БҮРЭЭР жагсаана (модулиар биш) — «Ерөнхий мэдээлэл»
 * гэсэн нэг мөрийн оронд доторх Барилга, Ногоон байгууламж, Зам… тус тусдаа гарна.
 * Уншихад хялбар байхын тулд эх модулиар нь бүлэглэв.
 *
 * Эдгээр давхарга ЗӨВХӨН харагдана: дарж сонгогдохгүй, тодруулга/шүүлтэд оролцохгүй,
 * самбарын статистикт огт нөлөөлөхгүй. Зорилго нь өөр өгөгдлийг байрлалаар нь тулгах.
 */
export function OverlayControl({
  module,
  sublayers,
  overlays,
  setOverlays,
}: {
  module: ModuleKey;
  /** Идэвхтэй модулийн ил байгаа дэд давхаргууд (ерөнхий мэдээлэл, шугам сүлжээ) */
  sublayers?: string[];
  overlays: string[];
  setOverlays: Dispatch<SetStateAction<string[]>>;
}) {
  const [open, setOpen] = useState(false);

  /**
   * Идэвхтэй модулийн давхарга мөн үү.
   *
   * Эдгээр нь өмнө нь жагсаалтаас БҮРМӨСӨН хасагддаг байсан тул хэрэглэгч зурган
   * дээр яг юу байгааг бүтэн харж чаддаггүй байв. Одоо жагсаалтад гарч, асаалттай
   * гэж тэмдэглэгдэнэ — зөвхөн унтраах боломжгүй (модулийн үндсэн өгөгдөл нь тэр).
   */
  const isActive = (l: OverlayLayer) => l.module === module;

  /**
   * Идэвхтэй модулийн давхарга ҮНЭХЭЭР ил байгаа эсэх.
   *
   * ⚠️ «Модулийнх нь мөн» гэдэг нь ил гэсэн үг БИШ: ерөнхий мэдээлэл, шугам
   * сүлжээ нь дэд давхаргатай бөгөөд зөвхөн сонгосон нь харагдана. Тэмдэглэгээ нь
   * `MapCanvas`-ийн харагдацын логиктой ЯГ ижил байх ёстой, эс бөгөөс жагсаалт
   * зурагтай зөрчилдөнө.
   */
  const activeVisible = (l: OverlayLayer) => {
    const sub = l.id.includes(':') ? l.id.split(':')[1] : null;
    return sub == null || (sublayers?.includes(sub) ?? true);
  };

  /**
   * Эх модулиар нь бүлэглэнэ — MODULES-ийн дараалал хадгална.
   * Модульд харьяалагдахгүй давхарга (агаарын зураг) нь тусдаа, ХАМГИЙН ДЭЭД бүлэг.
   */
  const groups = [
    { key: 'base', title: 'Суурь', layers: OVERLAY_LAYERS.filter((l) => l.module === null) },
    ...MODULES.map((m) => ({
      key: m.key as string,
      title: m.key === module ? `${m.title} · идэвхтэй` : m.title,
      layers: OVERLAY_LAYERS.filter((l) => l.module === m.key),
    })),
  ].filter((g) => g.layers.length > 0);

  const toggle = (id: string) =>
    setOverlays((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className={`${s.box} ${open ? s.boxOpen : ''}`}>
      <button type="button" className={s.head} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="layers" size={15} />
        <span className={s.title}>Давхарга нэмэх</span>
        {overlays.length > 0 && <span className={`${s.count} num`}>{overlays.length}</span>}
        <span className={`${s.caret} ${open ? s.caretOpen : ''}`} aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className={s.body}>
          <p className={s.note}>
            Зурган дээр байгаа бүх давхарга. Идэвхтэй модулийнх нь тэмдэглэгдсэн байна —
            нэмж асаасан давхарга нь статистик, шүүлтэд нөлөөлөхгүй.
          </p>

          {groups.map((g) => (
            <div key={g.key} className={s.group}>
              {/* Нэг давхаргатай модульд гарчиг нь давхаргын нэртэй давхцах тул хэрэггүй */}
              {g.layers.length > 1 && <div className={s.groupHead}>{g.title}</div>}

              {g.layers.map((l) => {
                const active = isActive(l);
                // Идэвхтэй модулийн давхарга нь `overlays`-д ордоггүй — түүний
                // харагдац нь модулиасаа шууд шийдэгддэг тул тусад нь тооцно.
                const on = active ? activeVisible(l) : overlays.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    // Модулийн үндсэн өгөгдлийг эндээс унтраавал самбар нь зурагтайгаа
                    // зөрчилдөнө. Дэд давхаргыг модулийн өөрийнх нь самбараас сонгоно.
                    disabled={active}
                    title={active ? 'Идэвхтэй модулийн давхарга' : undefined}
                    className={`${s.item} ${on ? s.itemOn : ''} ${active ? s.itemLocked : ''}`}
                    style={{ '--tone': l.hue } as CSSProperties}
                    onClick={() => !active && toggle(l.id)}
                  >
                    <span className={s.check} aria-hidden>
                      {on && (
                        <svg viewBox="0 0 12 12" width="9" height="9">
                          <path
                            d="M2 6.2 4.6 8.8 10 3.4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className={s.label}>{l.title}</span>
                  </button>
                );
              })}
            </div>
          ))}

          {overlays.length > 0 && (
            <button type="button" className={s.clear} onClick={() => setOverlays([])}>
              Бүгдийг унтраах
            </button>
          )}
        </div>
      )}
    </div>
  );
}
