'use client';

import { useEffect, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { entItemPage, entPdfBlob } from '@/lib/entDocs';
import { Loading, userError } from './ui';
import s from './docviewer.module.css';

/**
 * «ТЭЗҮ» цонхны ENTERPRISE PDF хэсэг (2026-10-08, туршилт — `lib/entDocs.ts`-ийн толгой).
 *
 * Зүүн жагсаалтын доор: нэвтрэх маягт → «PDF оруулах» + геопорталын PDF item-үүд.
 * Сонгосон item-ийг баруун талд `EntDocFrame` харуулна. `DocViewer` нь сонголтыг
 * `ent:<id>` түлхүүрээр ялгана.
 */
export const ENT_KEY = 'ent:';


/**
 * Сонгосон item-ийн PDF — токентой POST-оор татаж objectURL-ээр `<iframe>`-д.
 */
export function EntDocFrame({ id, narrow }: { id: string; narrow: boolean }) {
  const [state, setState] = useState<{ id: string; url?: string; err?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    entPdfBlob(id)
      .then((b) => {
        url = URL.createObjectURL(b);
        if (alive) setState({ id, url });
        else URL.revokeObjectURL(url);
      })
      .catch((e) => { if (alive) setState({ id, err: userError(e) }); });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  const cur = state?.id === id ? state : null;
  if (!cur) return <div className={s.ext}><Loading /></div>;
  if (cur.err) {
    return (
      <div className={s.ext}>
        <p className={s.pick}>{cur.err}</p>
        <a className={s.extBtn} href={entItemPage(id)} target="_blank" rel="noopener noreferrer">
          {tr('Геопорталд нээх ↗')}
        </a>
      </div>
    );
  }
  if (narrow) {
    return (
      <div className={s.ext}>
        <a className={s.extBtn} href={cur.url} target="_blank" rel="noopener noreferrer">{tr('PDF — шинэ таб-д нээх ↗')}</a>
      </div>
    );
  }
  return <iframe key={id} className={s.frame} src={cur.url} title={tr('Enterprise PDF')} />;
}
