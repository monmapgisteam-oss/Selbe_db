'use client';

/**
 * ЧАНАРЫН БАРИМТ — Ажлын аргачлал (MS) ирүүлэх · хянах · батлах харагдац.
 *
 * ⚠️ «Чанар (QAQC)»-ААС ТУСДАА ЦЭС (2026-09-16, хэрэглэгчийн шийдвэр). Тэр
 *    нь ITP-ийн хүснэгт бөглөнө; энэ нь Чанарын хэлтсийн 5 процессын
 *    (MS · MA · MIR · FIC · NCR) ЗУРАГЛАЛААР явдаг баримтын урсгал. Эхний
 *    хэрэгжилт нь MS — бусад процесс MS-ийг иш татдаг тул түүнээс эхэлнэ.
 *
 * ⚠️ ЗУРАГЛАЛЫН АЛХМУУД ↔ ЭНЭ ДЭЛГЭЦ:
 *    1 · Гүйцэтгэгч боловсруулна      → «Шинэ аргачлал» · ноорог засах
 *    2 · Ирүүлнэ                       → «Хянуулахаар илгээх»
 *    3 · 4а · 4б ТУХ · Чанар · ХАБЭА   → хянагчийн гурван хөзөр (ЗЭРЭГЦЭЭ)
 *    5 · Нэгтгэл                       → `chanarMs.resolve` (гурав зөвшөөрөх)
 *    6 · Буцаагдсан → сайжруулах       → «Буцаагдсан» төлөвт зохиогч засна
 *    7 · 8 · Гарын үсэг · тархаалт     → батлагдсан баримт ба хавсралт (PDF)
 *    9 · Хэрэгжүүлэх                   → Батлагдсан жагсаалт
 *
 * ⚠️ ДҮРЭМ ЭНД БИШ — `chanarMs.ts` (цэвэр) ба `chanarStore.ts` (серверийн
 *    мөрөөс шалгана). Энд зөвхөн товч харуулах/нуух (`canAct`).
 *
 * ⚠️ ДУГААР ГАРААР ОРОХГҮЙ — `chanarMs.docNo` автомат
 *    (`<ORG>-SLB-MS-P<багц>-<seq>-<rev>`), 423 жишээ файлын нэрлэлт.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { useAuth } from '@/components/AuthGate';
import { roleForUser } from '@/lib/services';
import { PKG_GROUPS } from '@/modules/sheet/bagts.pkg';
import { chanarAclReady, isAuthorFor, reviewerRolesFor, subscribeChanarAcl } from '@/lib/chanarAcl';
import {
  canAct, EMPTY_BODY, history, latest, MS_STATUS, progress, REVIEWERS, VERDICT,
  type MsBody, type MsDoc, type MsStatus, type Reviewer,
} from '@/lib/chanarMs';
import {
  addAttachment, chanarTableState, createDraft, deleteAttachment, listAttachments,
  loadBody, loadDocs, reviewDoc, saveDraft, submitDoc, type Attachment, type TableState,
} from '@/lib/chanarStore';
import { chanarRoleLabel } from './ChanarAcl';
import s from './chanar.module.css';

/** Маягтын 6 хэсэг — MS PDF-ийн бүтэц (`MsBody`) */
const SECTIONS: { k: keyof MsBody; label: () => string; hint: () => string }[] = [
  { k: 'general', label: () => tr('1. Ерөнхий мэдээлэл'), hint: () => tr('Ажлын нэр, байршил, гэрээний иш, хамрах хугацаа') },
  { k: 'scope', label: () => tr('2. Ажлын хамрах хүрээ'), hint: () => tr('Ямар ажил, ямар хэмжээ, зураг төслийн иш') },
  { k: 'materials', label: () => tr('3. Материал · тоног төхөөрөмж · хүн хүч'), hint: () => tr('Материалын жагсаалт, машин механизм, ажилтны бүрэлдэхүүн') },
  { k: 'sequence', label: () => tr('4. Ажлын дараалал, технологи'), hint: () => tr('Алхам алхмаар: бэлтгэл → гүйцэтгэл → дуусгал') },
  { k: 'quality', label: () => tr('5. Чанарын хяналт, шалгалт'), hint: () => tr('ITP-тэй холбоо, шалгах цэг, хүлээн авах шалгуур, туршилт') },
  { k: 'safety', label: () => tr('6. ХАБЭА арга хэмжээ'), hint: () => tr('Эрсдэл, хамгаалах хэрэгсэл, аюулгүй ажиллагааны заавар') },
];

const ymd = (ms: number | null): string => {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const tagCls = (st: MsStatus): string => {
  if (st === MS_STATUS.approved) return s.tagApproved;
  if (st === MS_STATUS.returned) return s.tagReturned;
  if (st === MS_STATUS.review) return s.tagReview;
  return s.tagDraft;
};

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

/** Хавсралт + аль хувилбарын мөрөнд байгаа нь (№6 аудит, 2026-09-16) */
type Att = Attachment & { parentOid: number };
export function Chanar() {
  const { user } = useAuth();
  const me = user?.username ?? '';
  const isSuper = roleForUser(me) === 'super';

  const [, tick] = useState(0);
  useEffect(() => subscribeChanarAcl(() => tick((n) => n + 1)), []);

  const [pkg, setPkg] = useState<string>(PKG_GROUPS[0] ?? '');
  const [filter, setFilter] = useState<'all' | MsStatus>('all');
  const [table, setTable] = useState<TableState | null>(null);
  const [docs, setDocs] = useState<MsDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [sel, setSel] = useState<number | null>(null);
  const [body, setBody] = useState<MsBody | null>(null);
  const [atts, setAtts] = useState<Att[]>([]);
  /* Засварын ноорог — зөвхөн `edit` горимд */
  const [edit, setEdit] = useState(false);
  const [dTitle, setDTitle] = useState('');
  const [dBody, setDBody] = useState<MsBody>({ ...EMPTY_BODY });
  const [rNote, setRNote] = useState('');

  const authorOk = isAuthorFor(me || null, pkg);
  /* ⚠️ `useMemo` БИШ (2026-09-24): хамаарал нь `me`·`pkg` тул ACL remote-оос
     ирэхэд (`subscribeChanarAcl` tick) хянагчийн үүрэг шинэчлэгдэхгүй, хөзөр
     нээгдэхгүй байв. Тооцоо хямд — зурагдах бүрд шууд. */
  const myRoles = reviewerRolesFor(me || null, pkg);
  /* ⚠️ Панелуудтай ИЖИЛ түгжээний зурвас — ACL уншигдтал үүрэг `[]` */
  const aclLocked = !chanarAclReady();
  const LOCK_MSG = tr('Эрхийн хүснэгт уншигдсангүй — засвар хаалттай, дахин ачаална уу.');

  const refresh = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const st = await chanarTableState(isSuper);
      setTable(st);
      if (!st.ok) { setDocs([]); return; }
      setDocs(await loadDocs('MS'));
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  }, [isSuper]);

  useEffect(() => { void refresh(); }, [refresh]);

  const inPkg = useMemo(() => docs.filter((d) => d.bagts === pkg), [docs, pkg]);
  const heads = useMemo(() => latest(inPkg)
    .filter((d) => filter === 'all' || d.status === filter)
    .sort((a, b) => b.seq - a.seq), [inPkg, filter]);

  const doc = useMemo(() => docs.find((d) => d.oid === sel) ?? null, [docs, sel]);
  const hist = useMemo(() => (doc ? history(inPkg, doc.bagts, doc.seq) : []), [inPkg, doc]);

  /* Сонгоход бие ба хавсралтыг татна */
  useEffect(() => {
    /* ⚠️ `setEdit(false)` ЭНД БАЙХГҮЙ (2026-09-16 аудит): `startNew` нь
       `setSel(null); setEdit(true)` дуудахад энэ салбар шинэ маягтыг гарч
       ирмэгц ХААДАГ байв — зөвхөн юу ч сонгоогүй үед л ажиллаж байлаа.
       Сонголт цэвэрлэх газрууд (багц солих) маягтаа өөрсдөө хаана. */
    if (sel == null) { setBody(null); return; }
    let live = true;
    setBody(null); setEdit(false);
    void loadBody(sel).then((b) => {
      if (!live) return;
      setBody(b ?? { ...EMPTY_BODY });
    }).catch((e) => live && setErr(String((e as Error).message || e)));
    return () => { live = false; };
  }, [sel]);

  /*
   * ⚠️ ХАВСРАЛТ БҮХ ХУВИЛБАРААС (2026-09-16 аудит). Дахин ирүүлэхэд `submitDoc`
   *    ШИНЭ OBJECTID үүсгэдэг тул гэрчилгээ, лабораторийн хавсралт хуучин мөрд
   *    үлдэж, хянагч шинэ хувилбарыг «хавсралтгүй» гэж хардаг байв. Түүхийн
   *    мөр бүрээс цуглуулна; устгах нь зөвхөн ОДООГИЙН мөрийнхөд.
   */
  const attIds = useMemo(
    () => (sel == null ? [] : [...new Set([sel, ...hist.map((h) => h.oid)])]),
    [sel, hist],
  );
  const reloadAtts = useCallback(async () => {
    const ls = await Promise.all(attIds.map(async (id) => (await listAttachments(id)).map((a) => ({ ...a, parentOid: id }))));
    setAtts(ls.flat());
  }, [attIds]);
  useEffect(() => {
    if (!attIds.length) { setAtts([]); return; }
    let live = true;
    void Promise.all(attIds.map(async (id) => (await listAttachments(id)).map((a) => ({ ...a, parentOid: id }))))
      .then((ls) => { if (live) setAtts(ls.flat()); })
      .catch((e) => live && setErr(String((e as Error).message || e)));
    return () => { live = false; };
  }, [attIds]);

  const act = doc ? canAct(doc, me || null, myRoles) : { edit: false, submit: false, review: [] as Reviewer[] };

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    if (busy) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await fn();
      if (!r.ok) { setErr(r.error ?? tr('Амжилтгүй.')); return false; }
      setNote(okMsg);
      await refresh();
      return true;
    } catch (e) {
      setErr(String((e as Error).message || e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  /* ── 1-р алхам: шинэ ноорог ── */
  const startNew = () => {
    setSel(null); setEdit(true);
    setDTitle(''); setDBody({ ...EMPTY_BODY }); setBody(null); setAtts([]);
  };
  const startEdit = () => {
    if (!doc || !body) return;
    setEdit(true); setDTitle(doc.title); setDBody({ ...body });
  };
  const saveNew = async () => {
    if (!dTitle.trim()) { setErr(tr('Аргачлалын нэрийг бичнэ үү.')); return; }
    let oid = 0;
    const ok = await run(async () => {
      const r = await createDraft({ kind: 'MS', bagts: pkg, title: dTitle, author: me, body: dBody });
      if (r.ok) oid = r.oid;
      return r;
    }, tr('Ноорог хадгалагдлаа — дугаар автоматаар олгогдов.'));
    if (ok) { setEdit(false); setSel(oid); }
  };
  const saveEdit = async () => {
    if (!doc) return;
    if (!dTitle.trim()) { setErr(tr('Аргачлалын нэрийг бичнэ үү.')); return; }
    let oid = doc.oid;
    const ok = await run(async () => {
      const r = await saveDraft({ oid: doc.oid, who: me, title: dTitle, body: dBody });
      if (r.ok) oid = r.oid;
      return r;
    }, tr('Ноорог хадгалагдлаа.'));
    /* ⚠️ Буцаагдсан баримтыг засахад `saveDraft` rev+1 ШИНЭ мөр үүсгэнэ —
       түүн рүү шилжинэ, эс бөгөөс дэлгэц хуучин (татгалзсан) хувилбар дээр үлдэнэ. */
    if (ok) { setEdit(false); if (oid !== doc.oid) setSel(oid); else setBody({ ...dBody }); }
  };

  /* ── 2-р алхам: ирүүлэх ── */
  const send = async () => {
    if (!doc) return;
    if (!window.confirm(tr('«{0}» аргачлалыг ТУХ · Чанар · ХАБЭА гурван хянагчид илгээх үү? Илгээсний дараа засах боломжгүй.', doc.docNo))) return;
    let oid = doc.oid;
    const ok = await run(async () => {
      const r = await submitDoc({ oid: doc.oid, who: me });
      if (r.ok) oid = r.oid;
      return r;
    }, tr('Хянуулахаар илгээгдлээ — гурван хянагч зэрэгцээ хянана.'));
    if (ok) setSel(oid);
  };

  /* ── 3 · 4а · 4б: хянагчийн шийдвэр ── */
  const decide = async (as: Reviewer, verdict: typeof VERDICT[keyof typeof VERDICT]) => {
    if (!doc) return;
    if (verdict === VERDICT.return && !rNote.trim()) { setErr(tr('Татгалзах шалтгаанаа бичнэ үү.')); return; }
    const ok = await run(
      () => reviewDoc({ oid: doc.oid, as, who: me, verdict, note: rNote }),
      verdict === VERDICT.approve ? tr('Зөвшөөрөв.') : tr('Татгалзаж, гүйцэтгэгч рүү буцаав.'),
    );
    if (ok) setRNote('');
  };

  /* ── Хавсралт ── */
  const upload = async (files: FileList | null) => {
    if (!doc || !files?.length) return;
    setBusy(true); setErr('');
    try {
      /* ⚠️ ХЭМЖЭЭГ ИЛГЭЭХИЙН ӨМНӨ (2026-09-16 аудит): урьд нь файлыг бүтнээр
         илгээсний дараа л сервер татгалздаг байв. AGOL hosted хүснэгтийн
         хавсралтын хязгаар 10 МБ орчим — түүнээс дээшийг эндээс л таслана. */
      const MAX_ATT = 10 * 1024 * 1024;
      /* ⚠️ Нэг файл унавал ҮЛДСЭНИЙГ ч илгээнэ, алдааг нэгтгэж хэлнэ (2026-09-17) —
         урьд нь `break` тул бусад нь чимээгүй орхигддог байв. */
      const errs: string[] = [];
      for (const f of Array.from(files)) {
        if (f.size > MAX_ATT) { errs.push(tr('«{0}» хэт том — 10 МБ-аас бага файл хавсаргана уу.', f.name)); continue; }
        const r = await addAttachment(doc.oid, f);
        if (!r.ok) errs.push(`${f.name}: ${r.error ?? tr('Хавсралт хадгалагдсангүй.')}`);
      }
      if (errs.length) setErr(errs.join(' · '));
      await reloadAtts();
    } finally {
      setBusy(false);
    }
  };
  const removeAtt = async (a: Att) => {
    if (!doc || !window.confirm(tr('«{0}» хавсралтыг устгах уу?', a.name))) return;
    setBusy(true);
    try {
      if (!(await deleteAttachment(a.parentOid, a.id))) setErr(tr('Хавсралт устгагдсангүй.'));
      await reloadAtts();
    } finally {
      setBusy(false);
    }
  };

  const tableMsg = (st: TableState): string => {
    if (st.why === 'auth') return tr('Нэвтрээгүй байна — чанарын баримт харахын тулд ArcGIS-ээр нэвтэрнэ үү.');
    if (st.why === 'owner') return tr('«Selbe_Chanar_Barimt» хүснэгтийн эзэн танигдсангүй — админд хандана уу.');
    if (st.why === 'none') return tr('Чанарын баримтын хүснэгт хараахан үүсээгүй — super админ энэ хуудсыг нэг удаа нээхэд автоматаар үүснэ.');
    return st.detail ?? tr('Хүснэгт уншигдсангүй.');
  };

  return (
    <div className={s.frame}>
      <div className={s.head}>
        <label className={s.field}>
          {tr('Багц')}
          <select className={s.select} value={pkg} onChange={(e) => { setPkg(e.target.value); setSel(null); setEdit(false); }}>
            {PKG_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className={s.field}>
          {tr('Төлөв')}
          <select className={s.select} value={filter} onChange={(e) => setFilter(e.target.value as 'all' | MsStatus)}>
            <option value="all">{tr('Бүгд')}</option>
            {Object.values(MS_STATUS).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <span className={s.field}>
          {tr('Ажлын аргачлал (MS)')} · {heads.length}
        </span>
        <span className={s.grow} />
        {myRoles.length > 0 && (
          <span className={s.field} title={tr('Энэ багцад таны хянагчийн үүрэг')}>
            {myRoles.map(chanarRoleLabel).join(' · ')}
          </span>
        )}
        <button type="button" className={s.btn} disabled={loading || busy} onClick={() => void refresh()}>
          {loading ? tr('Уншиж байна…') : tr('Шинэчлэх')}
        </button>
        {authorOk && table?.ok && (
          <button type="button" className={`${s.btn} ${s.btnPri}`} disabled={busy} onClick={startNew}>
            {tr('+ Шинэ аргачлал')}
          </button>
        )}
      </div>

      {aclLocked && <p className={s.err} role="alert">{LOCK_MSG}</p>}
      {err && <p className={s.err} role="alert">{err}</p>}
      {note && <p className={s.note}>{note}</p>}
      {table && !table.ok && <p className={s.err} role="alert">{tableMsg(table)}</p>}

      <div className={s.split}>
        <div className={s.list}>
          {heads.length === 0 && !loading && (
            <div className={s.empty}>{tr('Энэ багцад аргачлал алга.')}</div>
          )}
          {heads.map((d) => {
            const p = progress(d.reviews);
            return (
              <button
                key={d.oid}
                type="button"
                className={`${s.card} ${d.oid === sel ? s.cardOn : ''}`}
                onClick={() => { setSel(d.oid); setEdit(false); }}
              >
                <span className={s.cardNo}>{d.docNo}</span>
                <span className={s.cardTitle}>{d.title || tr('(нэргүй)')}</span>
                <span className={s.cardMeta}>
                  <span className={`${s.tag} ${tagCls(d.status)}`}>{d.status}</span>
                  {d.status === MS_STATUS.review && <span>{p.done}/{p.total}</span>}
                  <span>{tr('Хувилбар')} {d.rev}</span>
                  <span>{d.author}</span>
                  <span>{ymd(d.sentAt)}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className={s.doc}>
          {edit && !doc ? (
            <Form
              title={dTitle} body={dBody} onTitle={setDTitle} onBody={setDBody}
              busy={busy} onSave={saveNew} onCancel={() => setEdit(false)}
              head={tr('Шинэ ажлын аргачлал — {0}', pkg)}
            />
          ) : !doc ? (
            <div className={s.empty}>{tr('Зүүн жагсаалтаас аргачлал сонгоно уу.')}</div>
          ) : edit ? (
            <Form
              title={dTitle} body={dBody} onTitle={setDTitle} onBody={setDBody}
              busy={busy} onSave={saveEdit} onCancel={() => setEdit(false)}
              head={doc.docNo}
            />
          ) : (
            <>
              <div className={s.docHead}>
                <span className={s.docNo}>{doc.docNo}</span>
                <span className={`${s.tag} ${tagCls(doc.status)}`}>{doc.status}</span>
                <span className={s.docTitle}>{doc.title}</span>
              </div>
              <dl className={s.meta}>
                <div><dt>{tr('Гүйцэтгэгч')}</dt><dd>{doc.org} · {doc.author}</dd></div>
                <div><dt>{tr('Багц')}</dt><dd>{doc.bagts}</dd></div>
                <div><dt>{tr('Хувилбар')}</dt><dd>{doc.rev}</dd></div>
                <div><dt>{tr('Ирүүлсэн')}</dt><dd>{ymd(doc.sentAt)}</dd></div>
                <div><dt>{tr('Шийдвэрлэсэн')}</dt><dd>{ymd(doc.decidedAt)}</dd></div>
              </dl>

              <div className={s.acts}>
                {act.edit && (
                  <button type="button" className={s.btn} disabled={busy || !body} onClick={startEdit}>{tr('Засах')}</button>
                )}
                {act.submit && (
                  <button type="button" className={`${s.btn} ${s.btnPri}`} disabled={busy} onClick={() => void send()}>
                    {doc.status === MS_STATUS.returned ? tr('Дахин илгээх (хувилбар +1)') : tr('Хянуулахаар илгээх')}
                  </button>
                )}
              </div>

              {body == null ? (
                <div className={s.empty}>{tr('Уншиж байна…')}</div>
              ) : SECTIONS.map((sec) => (
                <div key={sec.k} className={s.sec}>
                  <div className={s.secHead}>{sec.label()}</div>
                  {body[sec.k]
                    ? <p className={s.secText}>{body[sec.k]}</p>
                    : <p className={`${s.secText} ${s.secEmpty}`}>{tr('бөглөөгүй')}</p>}
                </div>
              ))}

              <div className={s.sec}>
                <div className={s.secHead}>{tr('7. Хавсралт — гэрчилгээ · лаборатори · зураг')}</div>
                <div className={s.atts}>
                  {atts.length === 0 && <span className={s.secEmpty}>{tr('хавсралтгүй')}</span>}
                  {atts.map((a) => (
                    <div key={a.id} className={s.att}>
                      <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a>
                      <span className={s.attSize}>{kb(a.size)}</span>
                      {a.parentOid !== doc.oid && (
                        <span className={s.attSize} title={tr('Өмнөх хувилбарын хавсралт')}>
                          R{hist.find((h) => h.oid === a.parentOid)?.rev ?? '?'}
                        </span>
                      )}
                      {act.edit && a.parentOid === doc.oid && (
                        <button type="button" className={s.btn} disabled={busy} onClick={() => void removeAtt(a)}>✕</button>
                      )}
                    </div>
                  ))}
                  {act.edit && (
                    <label className={s.field}>
                      <input type="file" multiple disabled={busy} onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
              </div>

              <div className={s.sec}>
                <div className={s.secHead}>{tr('Хяналт — ТУХ · Чанар · ХАБЭА (зэрэгцээ)')}</div>
                <div className={s.reviews}>
                  {REVIEWERS.map((r) => {
                    const v = doc.reviews[r];
                    const mine = act.review.includes(r);
                    return (
                      <div key={r} className={s.rev}>
                        <span className={s.revWho}>{chanarRoleLabel(r)}</span>
                        {v ? (
                          <>
                            <span className={`${s.tag} ${v.verdict === VERDICT.approve ? s.tagApproved : s.tagReturned}`}>{v.verdict}</span>
                            <span>{v.who} · {ymd(v.at)}</span>
                            {v.note && <span className={s.revNote}>{v.note}</span>}
                          </>
                        ) : (
                          <span className={s.secEmpty}>
                            {doc.status === MS_STATUS.review ? tr('хүлээгдэж байна') : '—'}
                          </span>
                        )}
                        {mine && (
                          <div className={s.revActs}>
                            <button type="button" className={`${s.btn} ${s.btnOk}`} disabled={busy} onClick={() => void decide(r, VERDICT.approve)}>
                              {tr('Зөвшөөрөх')}
                            </button>
                            <button type="button" className={`${s.btn} ${s.btnBad}`} disabled={busy} onClick={() => void decide(r, VERDICT.return)}>
                              {tr('Татгалзах')}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {act.review.length > 0 && (
                  <textarea
                    className={s.textarea}
                    placeholder={tr('Санал, шаардлага — татгалзахад ЗААВАЛ')}
                    value={rNote}
                    onChange={(e) => setRNote(e.target.value)}
                    disabled={busy}
                  />
                )}
              </div>

              {hist.length > 1 && (
                <div className={s.sec}>
                  <div className={s.secHead}>{tr('Өөрчлөлтийн түүх')}</div>
                  <table className={s.hist}>
                    <thead>
                      <tr>
                        <th>{tr('Хувилбар')}</th><th>{tr('Дугаар')}</th><th>{tr('Төлөв')}</th>
                        <th>{tr('Ирүүлсэн')}</th><th>{tr('Шийдвэр')}</th><th>{tr('Хянагчийн санал')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* ⚠️ Гараар ч сонгогдоно (2026-09-23): `<tr onClick>` нь
                          фокус авдаггүй тул Tab-аар хүрэх аргагүй байв. */}
                      {hist.map((h) => (
                        <tr
                          key={h.oid}
                          className={h.oid === doc.oid ? s.histOn : ''}
                          onClick={() => setSel(h.oid)}
                          tabIndex={0}
                          role="button"
                          aria-pressed={h.oid === doc.oid}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(h.oid); }
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>{h.rev}</td>
                          <td>{h.docNo}</td>
                          <td><span className={`${s.tag} ${tagCls(h.status)}`}>{h.status}</span></td>
                          <td>{ymd(h.sentAt)}</td>
                          <td>{ymd(h.decidedAt)}</td>
                          <td>{REVIEWERS.map((r) => h.reviews[r]?.note).filter(Boolean).join(' · ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Маягт — шинэ ба засах хоёуланд */
function Form({
  head, title, body, onTitle, onBody, busy, onSave, onCancel,
}: {
  head: string;
  title: string;
  body: MsBody;
  onTitle: (v: string) => void;
  onBody: (v: MsBody) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className={s.docHead}>
        <span className={s.docNo}>{head}</span>
        <input
          className={`${s.input} ${s.grow}`}
          placeholder={tr('Аргачлалын нэр — жишээ: Төмөр бетон суурийн ажил')}
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          disabled={busy}
        />
      </div>
      {SECTIONS.map((sec) => (
        <div key={sec.k} className={s.sec}>
          <div className={s.secHead}>{sec.label()}</div>
          <textarea
            className={s.textarea}
            placeholder={sec.hint()}
            value={body[sec.k]}
            onChange={(e) => onBody({ ...body, [sec.k]: e.target.value })}
            disabled={busy}
          />
        </div>
      ))}
      <div className={s.acts}>
        <button type="button" className={`${s.btn} ${s.btnPri}`} disabled={busy} onClick={onSave}>{tr('Ноорог хадгалах')}</button>
        <button type="button" className={s.btn} disabled={busy} onClick={onCancel}>{tr('Болих')}</button>
      </div>
    </>
  );
}
