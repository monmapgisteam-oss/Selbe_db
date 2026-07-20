'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { search, MIN_QUERY, type Hit } from '@/lib/search';
import { Icon } from '@/components/Icon';
import s from './search.module.css';

/**
 * Толгойн нэгдсэн хайлт.
 *
 * ⚠️ Товчлуур бүрд хүсэлт явуулахгүй — 300 мс debounce. Хоёр FeatureServer рүү
 * очдог тул хурдан бичихэд хүсэлт хуримтлагдана.
 *
 * ⚠️ Хариу ирэх дараалал баталгаагүй тул хүсэлт бүрд дугаар өгч, ЗӨВХӨН хамгийн
 * сүүлийн дугаарынхыг зурна. Эс бөгөөс удаан явсан хуучин хүсэлт шинийг нь дарж
 * бичээд, хэрэглэгч бичсэнтэйгээ таарахгүй үр дүн харна.
 */
export function Search({ onPick }: { onPick: (hit: Hit) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const listId = useId();

  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_QUERY) {
      setHits([]);
      setBusy(false);
      setError(null);
      return;
    }

    const mine = ++seq.current;
    setBusy(true);

    const t = setTimeout(() => {
      search(query)
        .then((r) => {
          if (seq.current !== mine) return; // хоцорсон хариу — хаяна
          setHits(r);
          setError(null);
        })
        .catch((e: unknown) => {
          if (seq.current !== mine) return;
          setHits([]);
          setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (seq.current === mine) setBusy(false);
        });
    }, 300);

    return () => clearTimeout(t);
  }, [q]);

  /* Гадуур дарахад хаагдана */
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const pick = (h: Hit) => {
    onPick(h);
    setOpen(false);
    setQ('');
    setHits([]);
  };

  const short = q.trim().length > 0 && q.trim().length < MIN_QUERY;
  // Бүлгийн гарчгийг үр дүнгийн дарааллаар нь оруулна — урьдчилан бүлэглэвэл
  // сервер талын ач холбогдлын дараалал алдагдана
  let lastGroup = '';

  return (
    <div className={s.wrap} ref={box}>
      <span className={s.icon} aria-hidden>
        <Icon name="target" size={15} />
      </span>

      <input
        type="search"
        className={s.input}
        value={q}
        placeholder="Блок, эзэмшигч, талбарын дугаар…"
        aria-label="Портал даяар хайх"
        aria-describedby={listId}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />

      {/* ⚠️ `role="listbox"` ЗОРИУДААР биш: бүлгийн гарчиг нь option биш элемент болж
          ордог тул listbox-ийн бүтэц эвдэрнэ. Амьд мужаар (`aria-live`) зарлавал
          дэлгэц уншигч үр дүн ирснийг зөв дуулгана. */}
      {open && q.trim().length > 0 && (
        <div className={s.pop} id={listId} aria-live="polite">
          {short && <div className={s.state}>Дор хаяж {MIN_QUERY} тэмдэгт бичнэ үү.</div>}
          {!short && busy && <div className={s.state}>Хайж байна…</div>}
          {!short && !busy && error && (
            <div className={`${s.state} ${s.err}`} role="alert">
              Хайлт амжилтгүй — {error}
            </div>
          )}
          {!short && !busy && !error && hits.length === 0 && (
            <div className={s.state}>Юу ч олдсонгүй.</div>
          )}

          {!busy && !error &&
            hits.map((h) => {
              const head = h.group !== lastGroup ? h.group : null;
              lastGroup = h.group;
              return (
                <div key={h.id}>
                  {head && <div className={s.group}>{head}</div>}
                  <button type="button" className={s.hit} onClick={() => pick(h)}>
                    <span className={s.hitTitle}>{h.title}</span>
                    {h.sub && <span className={s.hitSub}>{h.sub}</span>}
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
