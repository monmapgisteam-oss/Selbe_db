'use client';

import { useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { Icon } from './Icon';
import { OVERLAY_LAYERS } from './MapCanvas';
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
  overlays,
  setOverlays,
}: {
  module: ModuleKey;
  overlays: string[];
  setOverlays: Dispatch<SetStateAction<string[]>>;
}) {
  const [open, setOpen] = useState(false);

  // Идэвхтэй модулийн давхаргууд нь аль хэдийн ил тул жагсаалтад гарахгүй
  const available = OVERLAY_LAYERS.filter((l) => l.module !== module);

  /** Эх модулиар нь бүлэглэнэ — MODULES-ийн дараалал хадгална */
  const groups = MODULES.map((m) => ({
    module: m,
    layers: available.filter((l) => l.module === m.key),
  })).filter((g) => g.layers.length > 0);

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
            Зөвхөн газрын зураг дээр нэмж харуулна. Статистик, шүүлтэд нөлөөлөхгүй.
          </p>

          {groups.map((g) => (
            <div key={g.module.key} className={s.group}>
              {/* Нэг давхаргатай модульд гарчиг нь давхаргын нэртэй давхцах тул хэрэггүй */}
              {g.layers.length > 1 && <div className={s.groupHead}>{g.module.title}</div>}

              {g.layers.map((l) => {
                const on = overlays.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    className={`${s.item} ${on ? s.itemOn : ''}`}
                    style={{ '--tone': l.hue } as CSSProperties}
                    onClick={() => toggle(l.id)}
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
