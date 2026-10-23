'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { DOCS } from '@/lib/docs';
import { ENT_PORTAL, type EntPdf } from '@/lib/entDocs';
import {
  TEZU_GROUP, deletePdf, groupOf, listPdfs, loadGroups, movePdf, newGroupId, saveGroups, uploadPdf, type DocGroup,
} from '@/lib/docLib';
import { hasCap } from '@/lib/caps';
import { currentUser } from '@/lib/who';
import { askConfirm } from '@/lib/confirm';
import { EntSignIn, useEntSession } from './EntSignIn';
import { ENT_KEY } from './EntDocs';
import { userError } from './ui';
import { Icon } from './Icon';
import s from './docviewer.module.css';

/**
 * БАРИМТ БИЧГИЙН САНГИЙН ЖАГСААЛТ (2026-10-23, `lib/docLib.ts`-ийн толгой) — бүлэг бүрээр эвхэгддэг.
 *   · «ТЭЗҮ-БОНУ» бүлэгт хуучин статик баримтууд (`lib/docs.ts`) ба бүлгийн тагГҮЙ Enterprise PDF-үүд.
 *   · `docsUpload` эрхтэй бол: бүлэг нэмэх · нэр солих · (хоосон) устгах; бүлэгт PDF оруулах; PDF устгах · шилжүүлэх.
 * Сонголтын түлхүүр: статик — `DocItem.key`, Enterprise — `ent:<id>` (`DocViewer` ялгана).
 */
const kb = (n: number | null) =>
  n == null ? '' : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function DocLibSide({ active, onPick }: { active: string | null; onPick: (key: string) => void }) {
  const sess = useEntSession();
  /* ⚠️ 2026-10-23: хоёр тусдаа эрх — PDF оруулах/устгах/шилжүүлэх (`docsUpload`) · бүлэг засах (`docsGroups`) */
  const canEdit = hasCap(currentUser(), 'docsUpload');
  const canGroups = hasCap(currentUser(), 'docsGroups');
  const [groups, setGroups] = useState<DocGroup[] | null>(null);
  const [items, setItems] = useState<EntPdf[] | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set([TEZU_GROUP]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const upGroup = useRef<string>(TEZU_GROUP);
  /** Бүлгийн нэр бичих мөр — `id: null` = шинэ бүлэг (хөтчийн prompt биш, апп доторх оролт) */
  const [edit, setEdit] = useState<{ id: string | null; title: string } | null>(null);

  const reload = useCallback(async () => {
    setErr('');
    try {
      const [g, l] = await Promise.all([loadGroups(), sess ? listPdfs() : Promise.resolve([] as EntPdf[])]);
      setGroups(g);
      setItems(l);
    } catch (e) {
      setErr(userError(e));
      setGroups((g) => g ?? []);
      setItems((l) => l ?? []);
    }
  }, [sess]);

  useEffect(() => {
    let alive = true;
    Promise.all([loadGroups(), sess ? listPdfs() : Promise.resolve([] as EntPdf[])])
      .then(([g, l]) => { if (alive) { setGroups(g); setItems(l); } })
      .catch((e) => { if (alive) { setErr(userError(e)); setGroups((g) => g ?? []); setItems((l) => l ?? []); } });
    return () => { alive = false; };
  }, [sess]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(''); setNote('');
    try { await fn(); } catch (e) { setErr(userError(e)); } finally { setBusy(false); }
  };

  const saveEdit = () => run(async () => {
    const title = edit?.title.trim() ?? '';
    if (!edit || !title || !groups) { setEdit(null); return; }
    if (groups.some((x) => x.id !== edit.id && x.title.toLowerCase() === title.toLowerCase())) {
      throw new Error(tr('«{0}» нэртэй бүлэг аль хэдийн бий.', title));
    }
    const next = edit.id == null
      ? [...groups, { id: newGroupId(), title }]
      : groups.map((x) => (x.id === edit.id ? { ...x, title } : x));
    await saveGroups(next);
    setGroups(next);
    setEdit(null);
  });

  const editRow = (
    <div className={s.entRow}>
      <input className={s.entInput} autoFocus value={edit?.title ?? ''} placeholder={tr('Бүлгийн нэр')} aria-label={tr('Бүлгийн нэр')}
        onChange={(e) => setEdit((x) => (x ? { ...x, title: e.target.value } : x))}
        onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(); if (e.key === 'Escape') { e.stopPropagation(); setEdit(null); } }} />
      <button type="button" className={s.entBtn} disabled={busy || !edit?.title.trim()} onClick={() => { void saveEdit(); }}>{tr('Хадгалах')}</button>
      <button type="button" className={s.entLink} disabled={busy} onClick={() => setEdit(null)}>{tr('Болих')}</button>
    </div>
  );

  const removeGroup = (g: DocGroup) => run(async () => {
    if (!groups) return;
    if (!(await askConfirm(tr('«{0}» бүлгийг устгах уу?', g.title), { ok: tr('Устгах') }))) return;
    const next = groups.filter((x) => x.id !== g.id);
    await saveGroups(next);
    setGroups(next);
  });

  const pickUpload = (gid: string) => {
    upGroup.current = gid;
    fileRef.current?.click();
  };

  const upload = (files: FileList | null) => run(async () => {
    const list = files ? Array.from(files) : [];
    const errs: string[] = [];
    const notes: string[] = [];
    for (const f of list) {
      try {
        const { item, warn } = await uploadPdf(f, upGroup.current);
        /* ⚠️ Хайлтын индекс хоцордог — шинэ item-ийг өөрөө эхэнд нэмнэ (`entUploadPdf`-ийн ⚠️) */
        setItems((prev) => [item, ...(prev ?? []).filter((x) => x.id !== item.id)]);
        onPick(ENT_KEY + item.id);
        if (warn) notes.push(warn);
      } catch (e) {
        errs.push(`${f.name}: ${userError(e)}`);
      }
    }
    setOpen((o) => new Set(o).add(upGroup.current));
    if (fileRef.current) fileRef.current.value = '';
    if (errs.length) throw new Error(errs.join('\n'));
    if (notes.length) setNote(notes.join('\n'));
  });

  const removePdf = (d: EntPdf) => run(async () => {
    if (!(await askConfirm(tr('«{0}» PDF-ийг Enterprise-ээс бүрмөсөн устгах уу? Буцаах боломжгүй.', d.title), { ok: tr('Устгах') }))) return;
    await deletePdf(d);
    setItems((prev) => (prev ?? []).filter((x) => x.id !== d.id));
  });

  const move = (d: EntPdf, gid: string) => run(async () => {
    const tags = await movePdf(d, gid);
    setItems((prev) => (prev ?? []).map((x) => (x.id === d.id ? { ...x, tags } : x)));
  });

  const toggle = (gid: string) => setOpen((o) => { const n = new Set(o); if (n.has(gid)) n.delete(gid); else n.add(gid); return n; });

  const gl = groups ?? [];
  const byGroup = new Map<string, EntPdf[]>();
  for (const d of items ?? []) {
    const g = groupOf(d, gl);
    byGroup.set(g, [...(byGroup.get(g) ?? []), d]);
  }

  return (
    <>
      {ENT_PORTAL && <EntSignIn onSignedOut={() => setItems(null)} />}
      {(canEdit || canGroups) && (
        <div className={s.entRow}>
          {canGroups && <button type="button" className={s.entBtn} disabled={busy || !groups} onClick={() => setEdit({ id: null, title: '' })}>
            {tr('+ Бүлэг нэмэх')}
          </button>}
          <button type="button" className={s.entLink} disabled={busy} onClick={() => { void run(reload); }}>
            {tr('Шинэчлэх')}
          </button>
        </div>
      )}
      {edit?.id === null && editRow}
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" multiple hidden
        onChange={(e) => { void upload(e.target.files); }} />

      {groups == null ? <div className={s.entSub}>{tr('Ачаалж байна…')}</div> : gl.map((g) => {
        const pdfs = byGroup.get(g.id) ?? [];
        const statics = g.id === TEZU_GROUP ? DOCS : [];
        const n = pdfs.length + statics.length;
        const isOpen = open.has(g.id);
        return (
          <section key={g.id} className={s.grp}>
            <div className={s.grpHead}>
              <button type="button" className={s.grpToggle} aria-expanded={isOpen} onClick={() => toggle(g.id)}>
                <span aria-hidden>{isOpen ? '▾' : '▸'}</span>
                <span className={s.grpTitle}>{g.title}</span>
                <span className={s.grpN}>{n}</span>
              </button>
              {canEdit && sess && (
                <button type="button" className={s.grpAct} disabled={busy} title={tr('Энэ бүлэгт PDF оруулах')}
                  onClick={() => pickUpload(g.id)}>{tr('PDF +')}</button>
              )}
              {canGroups && (
                <button type="button" className={s.grpAct} disabled={busy} title={tr('Нэр солих')}
                  onClick={() => setEdit({ id: g.id, title: g.title })}>✎</button>
              )}
              {canGroups && g.id !== TEZU_GROUP && n === 0 && (
                <button type="button" className={s.grpAct} disabled={busy} title={tr('Хоосон бүлгийг устгах')}
                  onClick={() => { void removeGroup(g); }}>✕</button>
              )}
            </div>
            {edit?.id === g.id && editRow}
            {isOpen && (
              <div className={s.grpBody}>
                {statics.map((d) => {
                  const on = d.key === active;
                  return (
                    <button key={d.key} type="button" aria-current={on}
                      className={`${s.item} ${on ? s.itemOn : ''}`} onClick={() => onPick(d.key)}>
                      <span className={s.itemIcon}><Icon name="file" size={15} /></span>
                      <span className={s.itemText}>
                        <span className={s.itemTitle}>{d.title}</span>
                        <span className={s.itemSub}>{d.sub}</span>
                      </span>
                    </button>
                  );
                })}
                {pdfs.map((d) => {
                  const key = ENT_KEY + d.id;
                  const on = key === active;
                  return (
                    <div key={d.id} className={s.docRow}>
                      <button type="button" aria-current={on}
                        className={`${s.item} ${on ? s.itemOn : ''}`} onClick={() => onPick(key)}>
                        <span className={s.itemIcon}><Icon name="file" size={15} /></span>
                        <span className={s.itemText}>
                          <span className={s.itemTitle}>{d.title}</span>
                          <span className={s.itemSub}>
                            {[d.owner, d.modified ? new Date(d.modified).toLocaleDateString('sv-SE') : '', kb(d.size)].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                      {canEdit && (
                        <span className={s.docActs}>
                          {gl.length > 1 && (
                            <select className={s.docMove} value={g.id} disabled={busy} aria-label={tr('Бүлэг солих')}
                              onChange={(e) => { if (e.target.value !== g.id) void move(d, e.target.value); }}>
                              {gl.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                            </select>
                          )}
                          <button type="button" className={s.grpAct} disabled={busy} title={tr('PDF устгах')}
                            onClick={() => { void removePdf(d); }}>✕</button>
                        </span>
                      )}
                    </div>
                  );
                })}
                {n === 0 && <div className={s.entSub}>{tr('Баримт алга')}</div>}
              </div>
            )}
          </section>
        );
      })}
      {note && <div className={s.entSub} role="status" style={{ whiteSpace: 'pre-line' }}>{note}</div>}
      {err && <div className={s.entErr} role="alert">{err}</div>}
    </>
  );
}
