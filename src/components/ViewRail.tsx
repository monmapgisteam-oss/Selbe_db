'use client';

import { type CSSProperties } from 'react';
import { Icon } from './Icon';
import { VIEWS, type ViewKey } from '@/lib/services';
import s from './tree.module.css';

/**
 * Зүүн багана — БЭЛЭН ХАРАГДАЦУУД.
 *
 * ⚠️ Урьд нь энд 29 давхаргын чагт байв. Хэрэглэгч юу асаахаа мэдэхгүй, асаасны
 * дараа зураг бөглөрдөг байлаа. Одоо нэг товч дарахад зураг ба самбар ХОЁУЛАА
 * тухайн сэдвийнхээ байдалд шилжинэ — давхаргаа зохицуулах шаардлагагүй.
 *
 * Харагдац доторх давхаргыг унтраах хэрэгтэй бол САМБАРААС нь хийнэ: тэнд
 * давхарга бүрийн тоо, өртөг нь хажуудаа байгаа тул юуг унтраахаа мэдэж болно.
 */
export function ViewRail({
  view,
  setView,
}: {
  view: ViewKey;
  setView: (v: ViewKey) => void;
}) {
  return (
    <nav className={s.rail} aria-label="Харагдац">
      <div className={s.railHead}>Харагдац</div>

      {VIEWS.map((v) => {
        const on = v.key === view;
        return (
          <button
            key={v.key}
            type="button"
            aria-current={on}
            className={`${s.item} ${on ? s.itemOn : ''}`}
            style={{ '--tone': v.hue } as CSSProperties}
            onClick={() => setView(v.key)}
          >
            <span className={s.icon}><Icon name={v.icon} /></span>
            <span className={s.text}>
              <span className={s.title}>{v.title}</span>
              <span className={s.desc}>{v.desc}</span>
            </span>
          </button>
        );
      })}

      <p className={s.foot}>
        Харагдац сонгоход зураг ба самбар хамт солигдоно. Давхарга бүрийг
        самбараас нь тус тусад нь унтрааж болно.
      </p>
    </nav>
  );
}
