'use client';

/**
 * ЗӨВШӨӨРЛИЙН PDF (2026-11-11, хэрэглэгч) — зөвшөөрөл бүрт PDF хавсаргана: Enterprise-ийн «zovshoorol pdf» хавтаст item болж,
 * `zov-<objectid>` тагаар зөвшөөрөлтэйгөө холбогдоно (хүснэгт 181-д талбар нэмэхгүй). Сүүлд оруулсан нь нээгдэнэ.
 */
import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { entPdfBlob, entSearch, entUploadPdf, type EntPdf } from '@/lib/entDocs';
import { EntSignIn, useEntSession } from '@/components/EntSignIn';
import { userError } from '@/components/ui';
import type { Zov } from '@/lib/zovshoorol';
import s from './zovshoorol.module.css';

export const ZOV_DOC_FOLDER = 'zovshoorol pdf';
export const ZOV_TAG = 'selbe-zov';
export const zovTagOf = (oid: number): string => `zov-${oid}`;

export function ZovPdf({ z, canEdit }: { z: Zov; canEdit: boolean }) {
  const sess = useEntSession();
  const [item, setItem] = useState<EntPdf | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileEl = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sess) return;
    let alive = true;
    entSearch(`type:"PDF" AND tags:"${zovTagOf(z.oid)}"`)
      .then((r) => { if (alive) setItem(r.find((x) => x.tags?.includes(zovTagOf(z.oid))) ?? null); })
      .catch((e) => { if (alive) { setItem(null); setErr(userError(e)); } });
    return () => { alive = false; };
  }, [sess, z.oid]);

  const open = async () => {
    if (!item) return;
    const w = window.open('', '_blank');
    try {
      const url = URL.createObjectURL(await entPdfBlob(item.id));
      if (w) w.location.href = url; else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { w?.close(); setErr(userError(e)); }
  };

  const upload = async (file: File) => {
    setBusy(true); setErr(null);
    try {
      const title = [z.bagts, z.ner, z.dugaar].filter(Boolean).join(' · ').slice(0, 250);
      const r = await entUploadPdf(file, title, [ZOV_TAG, zovTagOf(z.oid)], ZOV_DOC_FOLDER);
      setItem(r.item);
      if (r.warn) setErr(r.warn);
    } catch (e) { setErr(userError(e)); } finally { setBusy(false); }
  };

  return (
    <div className={s.dlRow}>
      <dt>{tr('PDF')}</dt>
      <dd>
        {!sess ? <EntSignIn compact /> : (
          <>
            {item === undefined ? '…' : item
              ? <button type="button" className={s.btn} onClick={() => void open()}>{tr('Нээх')}</button>
              : tr('PDF алга')}
            {canEdit && (
              <>
                {' '}
                <button type="button" className={s.btn} disabled={busy} onClick={() => fileEl.current?.click()}>
                  {busy ? tr('Оруулж байна…') : item ? tr('Солих') : tr('PDF оруулах')}
                </button>
                <input ref={fileEl} type="file" accept="application/pdf,.pdf" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
              </>
            )}
          </>
        )}
        {err && <span role="alert"> {err}</span>}
      </dd>
    </div>
  );
}
