'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { DOCS } from '@/lib/docs';
import { ENT_PORTAL, type EntPdf } from '@/lib/entDocs';
import {
  TEZU_GROUP, defaultGroups, deletePdf, groupOf, hasGroupTag, listPdfs, loadGroups, movePdf, newGroupId, saveGroups, uploadPdf,
  type DocGroup,
} from '@/lib/docLib';
import { hasCap } from '@/lib/caps';
import { currentUser } from '@/lib/who';
import { askConfirm } from '@/lib/confirm';
import { EntSignIn, useEntSession } from './EntSignIn';
import { ENT_KEY } from './EntDocs';
import { Loading, userError } from './ui';
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

  /** Бүлгийн мөрийг уншиж чадаагүй — харуулж буй нь анхдагч жагсаалт тул бүлэг засахыг ХААНА (дарж бичихгүй) */
  const [groupsFailed, setGroupsFailed] = useState(false);
  /** PDF-ийн жагсаалт энэ сешнд амжилттай уншигдсан эсэх — үгүй бол бүлэг «хоосон» гэдгийг мэдэхгүй */
  const [listOk, setListOk] = useState(false);

  /**
   * ⚠️ 2026-10-23: хоёр уншилт ТУСДАА (`allSettled`) — өмнө нь `Promise.all` байсан тул PDF-ийн жагсаалт (Enterprise
   * хайлт) унахад бүлгүүд `[]` болж, статик ТЭЗҮ-БОНУ баримтууд ч хамт алга болдог байв.
   */
  const loadAll = useCallback(async (isAlive: () => boolean = () => true) => {
    const [g, l] = await Promise.allSettled([loadGroups(), sess ? listPdfs() : Promise.resolve(null)]);
    if (!isAlive()) return;
    const errs: string[] = [];
    if (g.status === 'fulfilled') { setGroups(g.value); setGroupsFailed(false); }
    else { setGroups((prev) => prev ?? defaultGroups()); setGroupsFailed(true); errs.push(userError(g.reason)); }
    if (l.status === 'fulfilled') { setItems(l.value ?? []); setListOk(l.value != null); }
    else { setItems((prev) => prev ?? []); setListOk(false); errs.push(userError(l.reason)); }
    setErr(errs.join('\n'));
  }, [sess]);

  const reload = useCallback(() => loadAll(), [loadAll]);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ⚠️ 2026-10-23: гаднын (Enterprise · эрхийн хүснэгт) уншилт — төлөв зөвхөн `await`-ийн ДАРАА тавигдана
    void loadAll(() => alive);
    return () => { alive = false; };
  }, [loadAll]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(''); setNote('');
    try { await fn(); } catch (e) { setErr(userError(e)); } finally { setBusy(false); }
  };

  const saveEdit = () => run(async () => {
    const title = edit?.title.trim() ?? '';
    if (!edit || !title || !groups || groupsFailed) { setEdit(null); return; }
    /* ⚠️ 2026-10-23: шинээр уншсан жагсаалт дээр зөвхөн ЭНЭ өөрчлөлтийг хийнэ (`saveGroups`-ийн ⚠️) */
    const next = await saveGroups((cur) => {
      if (cur.some((x) => x.id !== edit.id && x.title.toLowerCase() === title.toLowerCase())) {
        throw new Error(tr('«{0}» нэртэй бүлэг аль хэдийн бий.', title));
      }
      if (edit.id != null && !cur.some((x) => x.id === edit.id)) {
        throw new Error(tr('Энэ бүлгийг өөр хэрэглэгч устгасан байна — «Шинэчлэх» дарна уу.'));
      }
      return edit.id == null
        ? [...cur, { id: newGroupId(), title }]
        : cur.map((x) => (x.id === edit.id ? { ...x, title } : x));
    });
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
    if (!groups || groupsFailed || !sess) return;
    if (!(await askConfirm(tr('«{0}» бүлгийг устгах уу?', g.title), { ok: tr('Устгах') }))) return;
    /* ⚠️ 2026-10-23: «хоосон» эсэхийг ШИНЭ жагсаалтаар — хуучин/ачаалагдаагүй жагсаалтаар устгавал тэр бүлгийн PDF-үүд
       чимээгүй «ТЭЗҮ-БОНУ» руу шилждэг байв (`groupOf`) */
    const fresh = await listPdfs();
    /* хайлтын индекс хоцордог тул саяхан оруулсан (зөвхөн локал `items`-д буй) PDF-ийг ч тооцно */
    if (hasGroupTag([...fresh, ...(items ?? [])], g.id)) throw new Error(tr('«{0}» бүлэгт PDF байгаа тул устгах боломжгүй.', g.title));
    const next = await saveGroups((cur) => cur.filter((x) => x.id !== g.id));
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
      {ENT_PORTAL && <EntSignIn onSignedOut={() => { setItems(null); setListOk(false); }} />}
      {(canEdit || canGroups) && (
        <div className={s.entRow}>
          {canGroups && <button type="button" className={s.entBtn} disabled={busy || !groups || groupsFailed} onClick={() => setEdit({ id: null, title: '' })}>
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

      {groups == null ? <Loading /> : gl.map((g) => {
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
              {canGroups && !groupsFailed && (
                <button type="button" className={s.grpAct} disabled={busy} title={tr('Нэр солих')} aria-label={tr('Нэр солих')}
                  onClick={() => setEdit({ id: g.id, title: g.title })}>✎</button>
              )}
              {/* ⚠️ 2026-10-23: PDF-ийн жагсаалт энэ сешнд АМЖИЛТТАЙ уншигдсан үед л «хоосон» гэж үзнэ (гарсан · уншилт
                  унасан үед n=0 нь «мэдэхгүй» гэсэн үг) — `removeGroup` дахин шинэ жагсаалтаар шалгана */}
              {canGroups && !groupsFailed && sess && listOk && items != null && g.id !== TEZU_GROUP && n === 0 && (
                <button type="button" className={s.grpAct} disabled={busy} title={tr('Хоосон бүлгийг устгах')}
                  aria-label={tr('Хоосон бүлгийг устгах')} onClick={() => { void removeGroup(g); }}>✕</button>
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
                            aria-label={tr('PDF устгах')} onClick={() => { void removePdf(d); }}>✕</button>
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
