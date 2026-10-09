'use client';

import { useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { ENT_PORTAL, entItemPage, entListPdfs, entPdfBlob, entUploadPdf, type EntPdf } from '@/lib/entDocs';
import { EntSignIn, useEntSession } from './EntSignIn';
import { userError } from './ui';
import { Icon } from './Icon';
import s from './docviewer.module.css';

/**
 * «ТЭЗҮ» цонхны ENTERPRISE PDF хэсэг (2026-10-08, туршилт — `lib/entDocs.ts`-ийн толгой).
 *
 * Зүүн жагсаалтын доор: нэвтрэх маягт → «PDF оруулах» + геопорталын PDF item-үүд.
 * Сонгосон item-ийг баруун талд `EntDocFrame` харуулна. `DocViewer` нь сонголтыг
 * `ent:<id>` түлхүүрээр ялгана.
 *
 * ⚠️ `NEXT_PUBLIC_ENT_PORTAL_URL` хоосон бол юу ч зурахгүй.
 */
export const ENT_KEY = 'ent:';

/** ⚠️ 2026-10-09: хуваалцалтын төлөв — байгууллагад хуваалцагдсан эсэхийг жагсаалтаас шууд харна */
const accessLabel = (a: string | null): string =>
  a === 'org' ? tr('байгууллага') : a === 'public' ? tr('нийтэд') : a === 'shared' ? tr('бүлэгт') : a === 'private' ? tr('зөвхөн өөрт') : '';

const kb = (n: number | null) =>
  n == null ? '' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function EntDocsSide({ active, onPick }: { active: string | null; onPick: (key: string) => void }) {
  const sess = useEntSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /** ⚠️ 2026-10-09 (аудит): алдаа биш тэмдэглэл (жиш. item үүссэн ч дэлгэрэнгүй хоцорсон) */
  const [note, setNote] = useState('');
  const [items, setItems] = useState<EntPdf[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Нэвтэрмэгц жагсаалт татна */
  useEffect(() => {
    if (!sess) return;
    let alive = true;
    entListPdfs()
      .then((l) => { if (alive) setItems(l); })
      .catch((e) => { if (alive) { setItems([]); setErr(userError(e)); } });
    return () => { alive = false; };
  }, [sess]);

  if (!ENT_PORTAL) return null;

  const refresh = async () => {
    setBusy(true); setErr(''); setNote('');
    try { setItems(await entListPdfs()); } catch (x) { setErr(userError(x)); } finally { setBusy(false); }
  };

  const upload = async (files: FileList | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    setBusy(true); setErr(''); setNote('');
    const errs: string[] = [];
    const notes: string[] = [];
    for (const f of list) {
      try {
        const { item: it, warn } = await entUploadPdf(f);
        /* ⚠️ Хайлтын индекс хоцордог — шинэ item-ийг өөрөө эхэнд нэмнэ */
        setItems((prev) => [it, ...(prev ?? []).filter((x) => x.id !== it.id)]);
        onPick(ENT_KEY + it.id);
        /* ⚠️ Хуваалцалт унасан ч item БИЙ — алдаа биш анхааруулга (дахин оруулбал давхардана).
           ⚠️ 2026-10-09 (merge): улаан алдаа (`errs`) биш тэмдэглэл (`notes`) — аудитын «амжилттай, анхааруулгатай» дүрэм */
        if (warn) notes.push(warn);
      } catch (x) {
        errs.push(`${f.name}: ${userError(x)}`);
      }
    }
    if (errs.length) setErr(errs.join('\n'));
    if (notes.length) setNote(notes.join('\n'));
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section className={s.entBox} aria-label={tr('Enterprise PDF')}>
      <div className={s.entHead}>
        <span>{tr('Enterprise PDF')}</span>
      </div>

      {/* ⚠️ 2026-10-09: нэвтрэлтийн маягт `EntSignIn`-д (MA харагдацтай хуваалцана) */}
      <EntSignIn onSignedOut={() => setItems(null)} />
      {sess && (
        <>
          <div className={s.entRow}>
            <button type="button" className={s.entBtn} disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? tr('Түр хүлээнэ үү…') : tr('PDF оруулах')}
            </button>
            <button type="button" className={s.entLink} disabled={busy} onClick={() => { void refresh(); }}>
              {tr('Шинэчлэх')}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple hidden
            onChange={(e) => { void upload(e.target.files); }} />
          {items == null ? (
            <div className={s.entSub}>{tr('Ачаалж байна…')}</div>
          ) : items.length === 0 ? (
            <div className={s.entSub}>{tr('PDF алга')}</div>
          ) : items.map((d) => {
            const key = ENT_KEY + d.id;
            const on = key === active;
            return (
              <button key={d.id} type="button" aria-current={on}
                className={`${s.item} ${on ? s.itemOn : ''}`} onClick={() => onPick(key)}>
                <span className={s.itemIcon}><Icon name="file" size={15} /></span>
                <span className={s.itemText}>
                  <span className={s.itemTitle}>{d.title}</span>
                  <span className={s.itemSub}>
                    {[d.owner, d.modified ? new Date(d.modified).toLocaleDateString('sv-SE') : '', kb(d.size), accessLabel(d.access)].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            );
          })}
        </>
      )}
      {note && <div className={s.entSub} role="status" style={{ whiteSpace: 'pre-line' }}>{note}</div>}
      {err && <div className={s.entErr} role="alert">{err}</div>}
    </section>
  );
}

/**
 * Сонгосон item-ийн PDF — токентой POST-оор татаж objectURL-ээр `<iframe>`-д.
 * ⚠️ objectURL-ийг солих/хаах үед `revokeObjectURL` — санах ой алдагдахгүй.
 * ⚠️ Нарийн дэлгэцэд (`narrow`) iframe-ийн оронд шинэ таб-д нээх товч (`DocViewer`-ийн дүрэм).
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
  if (!cur) return <div className={s.ext}><p className={s.pick}>{tr('Ачаалж байна…')}</p></div>;
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
