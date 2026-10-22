'use client';

/**
 * «БАГЦЫН ХАМААРАЛ» — БАГЦ ХООРОНДЫН АЖЛЫН ХАМААРАЛ (2026-10-22, дахин бүтээв).
 *
 * ⚠️ Хэрэглэгчийн шийдвэр (2026-10-22): багц ↔ багц биш, АЖИЛ ↔ АЖИЛ — А багцын нэг ажил Б, В … багцуудын
 *    олон ажлаас хамаарна. ЗӨВХӨН ХАРУУЛНА (хуваарийн огноонд нөлөөгүй). Логик нь `lib/workDeps.ts`, алсын
 *    уншилт/бичилт нь `lib/workDepsRemote.ts`; хадгалалт нь хамаарах ажлын мөрийн `bagts_hamaaral` талбар.
 * ⚠️ Урсгал: А хуудас → ажлаа сонгох (хэсгээр бүлэглэсэн, хайлттай) → Б хуудас → Б-гийн ажлуудыг сонгох
 *    (checkbox, хэсгийн «бүгдийг», хайлт) → Хадгалах. Сонгосон ажлын урьдчилагчид (багцаар, ✕-тэй) ба түүнээс
 *    хамаардаг ажлууд харагдана. Дээр нь багцын түвшний тойм («А → Б: N холбоо», дарахад шүүнэ).
 * ⚠️ Эрх нь `hamaaral` (`capText`) — эрхгүй хүн БҮГДИЙГ харна, засах товчгүй («харах ≠ засах», `viewEdit.check`).
 * ⚠️ Талбар хараахан нэмэгдээгүй хуудсанд зөвхөн харах горим — аль хуудсанд дутуу байгааг ИЛ жагсаана; админ
 *    талбарыг нэмэнгүүт (мета) өөрөө идэвхжинэ.
 * ⚠️ Талбартай хуудас уншигдаагүй бол дугуйн шалгалт бүрэн биш тул БИЧИХИЙГ ХААНА (шалтгааныг хэлнэ).
 * ⚠️ ХУУЧИН багц ↔ багц холбоос (`bagtsHamaaral.ts`) — «Шилжүүлэх» нь засварлагчид А, Б-г урьдчилан сонгоно;
 *    тэр хосын ажлын холбоос хадгалагдмагц хуучин хос автоматаар устна.
 * ⚠️ Загвар нь `bagtsHamaaral.module.css` (ТУХ-ын хуулбар — харагдацууд стайл хуваалцахгүй).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { PKGS } from '@/modules/sheet/bagts.pkg';
import {
  dependentsOf, legacyCovered, legacyPkgKey, nodeMatches, pkgPairs, refOf, sectionsOf,
  type Edge, type NodeId, type RefChange, type WNode, type WorkGraph,
} from '@/lib/workDeps';
import { dropWorkCache, loadWorkData, saveWorkLinks, sheetsOfPkgKey } from '@/lib/workDepsRemote';
import { loadLegacyDeps, removeLegacyDeps, type Dep } from '@/lib/bagtsHamaaral';
import { useAuth } from '@/components/AuthGate';
import { friendlyError, userError } from '@/components/ui';
/* ⚠️ 2026-10-23 (UX аудит X1/P7/P8): аппын дотоод асуулт · «↶ Буцаах» · харагдацаас гарахад асуух */
import { askConfirm, toastUndo } from '@/lib/confirm';
import { setNavDirty } from '@/lib/navGuard';
import s from './bagtsHamaaral.module.css';

const pkgLabel = (p: string): string => PKGS.find((x) => x.key === p)?.label ?? p;
/* ⚠️ 2026-10-23 (UX аудит P6): хоосон нэр «» болж харагддаг байв (жиш. «А. Бэлтгэл ажил «» (8)») — бүлэгт «(нэргүй бүлэг)»,
   ажилд «(нэргүй ажил)»; замын хоосон хэсэгт «(нэргүй бүлэг)». Зөвхөн харуулна — түлхүүрт (`refOf`) хөндөхгүй. */
const nodeLabel = (n: Pick<WNode, 'path' | 'work'> & { group?: boolean }): string =>
  `${n.path.map((x) => x.trim() || tr('(нэргүй бүлэг)')).join(' → ')} «${n.work.trim() || (n.group ? tr('(нэргүй бүлэг)') : tr('(нэргүй ажил)'))}»`;
/** Урьдчилагчийн хуудас — тулгагдаагүй бол холбоосын `p` */
const edgePkg = (g: WorkGraph, e: Edge): string => (e.to ? g.nodes.get(e.to)?.p ?? e.ref.p : e.ref.p);
const whyText = (e: Edge): string => (e.why === 'unloaded'
  ? tr('хуудас уншигдаагүй')
  : e.why === 'ambiguous'
    ? tr('ижил нэртэй мөр нэмэгдсэн/хасагдсан — аль нь болохыг тодорхойлж чадсангүй')
    : tr('ажил олдсонгүй (устсан эсвэл нэр нь өөрчлөгдсөн)'));

export function BagtsHamaaral() {
  const dataQ = useAsync(loadWorkData, []);
  const legacyQ = useAsync(loadLegacyDeps, []);
  const { user } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `capN` нь эрх өөрчлөгдсөн дохио (`Zovshoorol`-той ижил)
  const canEdit = useMemo(() => hasCap(user?.username, 'hamaaral'), [user, capN]);

  /** А — хамаарах ажлын хуудас; Б — урьдчилагчийн хуудас (засварт) */
  const [pA, setPA] = useState<string>(PKGS[0]?.key ?? '');
  const [pB, setPB] = useState<string>('');
  const [sel, setSel] = useState<NodeId | null>(null);
  const [qA, setQA] = useState('');
  /** Тоймоос шүүлт — А-гийн зөвхөн энэ хуудаснаас хамаардаг ажлууд */
  const [flt, setFlt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const editorRef = useRef<HTMLDivElement | null>(null);
  /**
   * ⚠️ 2026-10-23 (UX аудит P8): ХАДГАЛААГҮЙ УРЬДЧИЛАГЧИЙН СОНГОЛТ (`PrereqPicker`) — урьд нь өөр ажил/багц сонгоход
   *    чимээгүй хаягддаг байв. Тоо нь энд (`onPickDirty`); сонголт солих бүр `guard`-аар асууна, харагдацаас гарах/F5-д
   *    `navGuard` (`Portal` · `beforeunload`) асууна.
   */
  const pickDirtyRef = useRef(0);
  const onPickDirty = useCallback((n: number) => {
    pickDirtyRef.current = n;
    setNavDirty('hamaaral-pick', n > 0, tr('Хадгалаагүй урьдчилагчийн сонголт'));
  }, []);
  useEffect(() => () => setNavDirty('hamaaral-pick', false), []);
  const guard = useCallback(async (): Promise<boolean> => {
    const n = pickDirtyRef.current;
    return n === 0 || askConfirm(tr('Хадгалаагүй {0} сонголт хаягдана. Үргэлжлүүлэх үү?', num(n)), { danger: true, ok: tr('Хаях') });
  }, []);

  const data = dataQ.state === 'ready' ? dataQ.data : null;
  const g = data?.graph ?? null;
  const sheetOf = useMemo(() => new Map((data?.sheets ?? []).map((x) => [x.pkg.key, x] as const)), [data]);
  const pairs = useMemo(() => (g ? pkgPairs(g).sort((a, b) => b.n - a.n || pkgLabel(a.to).localeCompare(pkgLabel(b.to), 'mn')) : []), [g]);
  const total = useMemo(() => (g ? [...g.pre.values()].reduce((a, e) => a + e.length, 0) : 0), [g]);
  const failed = useMemo(() => (data?.sheets ?? []).filter((x) => x.error), [data]);
  const missing = useMemo(() => (data?.sheets ?? []).filter((x) => !x.error && !x.field), [data]);
  /* ⚠️ Талбартай (эсвэл мета нь уншигдаагүй) хуудас дутуу бол дугуйн шалгалт бүрэн биш — бичихгүй */
  const blocked = failed.length > 0;
  const canWriteA = canEdit && !blocked && !!sheetOf.get(pA)?.field;
  const selNode = g && sel ? g.nodes.get(sel) ?? null : null;
  /* ⚠️ Өнчин холбоос (урьдчилагч нь олдохгүй/хоёрдмол/уншигдаагүй) — ЧИМЭЭГҮЙ хаяхгүй, нэгдсэн жагсаалтаар ил */
  const orphans = useMemo(() => (g ? [...g.pre].flatMap(([id, es]) => es.filter((e) => !e.to).map((e) => ({ id, e }))) : []), [g]);

  /* ── Хуучин багц ↔ багц холбоос (шилжүүлэлт) ── */
  const legacy = useMemo<Dep[]>(() => (legacyQ.state === 'ready' ? legacyQ.data.deps : []), [legacyQ]);
  const retryLegacy = legacyQ.retry;
  /* ⚠️ Ажлын түвшинд ШИЛЖСЭН хосыг (Y-ийн ажил X-ийн ажлаас хамаарсан холбоос бий) хуучин бүртгэлээс устгана —
     зөвхөн засах эрхтэй хүнд, хос бүрийг НЭГ удаа оролдоно (уналт гогцоо үүсгэхгүй). */
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!canEdit || !g || legacyQ.state !== 'ready') return;
    const cov = legacy.filter((d) => legacyCovered(pairs, d, sheetsOfPkgKey) && !tried.current.has(`${d.from}>${d.to}`));
    if (!cov.length) return;
    for (const d of cov) tried.current.add(`${d.from}>${d.to}`);
    void removeLegacyDeps(cov).then((r) => {
      if (r.ok) retryLegacy?.();
      else setErr(userError(r.error));
    });
  }, [canEdit, g, legacyQ.state, legacy, pairs, retryLegacy]);

  const removeLegacy = useCallback(async (d: Dep) => {
    /* ⚠️ 2026-10-23 (UX аудит X1/X7): аппын дотоод асуулт; «холбоос» → «холбоо» (товчны нэртэй нэг) */
    if (!(await askConfirm(tr('Хуучин «{0}» → «{1}» холбоог устгах уу?', d.from, d.to), { danger: true, ok: tr('Устгах') }))) return;
    setBusy(true);
    setErr('');
    try {
      const r = await removeLegacyDeps([d]);
      if (!r.ok) setErr(userError(r.error));
      else retryLegacy?.();
    } catch (e) {
      setErr(userError(e));
    } finally {
      setBusy(false);
    }
  }, [retryLegacy]);

  const migrate = useCallback(async (d: Dep) => {
    const pre = sheetsOfPkgKey(legacyPkgKey(d.from));
    const post = sheetsOfPkgKey(legacyPkgKey(d.to));
    if (!pre.length || !post.length) return;
    if (!(await guard())) return; // ⚠️ 2026-10-23 (P8)
    setPA(post[0]);
    setPB(pre[0]);
    setSel(null);
    setFlt(null);
    setQA('');
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [guard]);

  /* ── Хадгалах ── */
  /* ⚠️ 2026-10-23 (засвар): завгүй эсэхийг ref-ээр — «↶ Буцаах» мэдэгдэл ✕ дарсан үеийн `save`-ийн хаалтыг (тэр
     зурагдалтын `busy === false`) барьдаг тул 6 с-д өөр хадгалалт эхэлсэн үед буцаахад `saveWorkLinks`-ийн хоёр
     уншиж-бичих дуудлага зэрэг явж нэг өөрчлөлт чимээгүй алдагдах байв. */
  const busyRef = useRef(false);
  const save = useCallback(async (dep: WNode, change: RefChange): Promise<boolean> => {
    if (!g || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      /* ⚠️ 2026-10-22 (аудит): дугуйн шалгалт нь СҮҮЛИЙН өгөгдөл дээр (`saveWorkLinks` бусад хуудсыг дахин уншина) —
         харагдацын граф хэдэн цагаар хуучирч болно */
      const r = await saveWorkLinks(refOf(dep), change);
      if (!r.ok) { setErr(userError(r.error)); return false; }
      setMsg(r.wrote ? tr('Хадгалагдлаа') : tr('Өөрчлөлт алга — сервер аль хэдийн энэ төлөвт байна'));
      return true;
    } catch (e) {
      setErr(userError(e));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [g]);

  const reload = useCallback(() => { dropWorkCache(); dataQ.retry?.(); }, [dataQ]);

  /* ⚠️ 2026-10-22 (аудит): ≤900px-д (`.grid` нэг багана) дэлгэрэнгүй нь 60vh жагсаалтын ДООР — сонгоход юу ч өөрчлөгдсөнгүй
     мэт харагддаг байв; нарийн дэлгэцэд түүн рүү гүйлгэнэ */
  const detailRef = useRef<HTMLElement | null>(null);
  const pickWork = useCallback(async (id: NodeId) => {
    if (id !== sel && !(await guard())) return; // ⚠️ 2026-10-23 (P8)
    setSel(id);
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [sel, guard]);

  const openNode = useCallback(async (id: NodeId) => {
    const n = g?.nodes.get(id);
    if (!n) return;
    if (id !== sel && !(await guard())) return; // ⚠️ 2026-10-23 (P8)
    setPA(n.p);
    setSel(id);
    setFlt(null);
    setQA('');
  }, [g, sel, guard]);

  if (dataQ.state === 'loading') return <div className={s.wrap}><p className={s.loading}>{tr('Ачаалж байна…')}</p></div>;
  if (dataQ.state === 'error') {
    return (
      <div className={s.wrap}>
        <p className={s.failNote} role="alert">
          {tr('Бөглөх хуудсууд уншигдсангүй')}: {friendlyError(dataQ.error)}
          {' '}<button type="button" className={s.retryBtn} onClick={reload}>{tr('Дахин оролдох')}</button>
        </p>
      </div>
    );
  }
  if (!g) return null;

  return (
    <div className={s.wrap}>
      <section className={s.hero}>
        <p className={s.eyebrow}>{tr('ТУХ · багцын хяналт')}</p>
        <h1>{tr('Багцын хамаарал')} <small className={s.total}>{tr('{0} холбоо', num(total))}</small></h1>
        <p className={s.heroSub}>
          {tr('Нэг багцын ажил өөр багцуудын аль ажлаас хамаардгийг харуулна. Зөвхөн мэдээлэл — хуваарийн огноонд нөлөөлөхгүй.')}
        </p>
      </section>

      {/* ── Талбар дутуу хуудсууд — зөвхөн харах ── */}
      {missing.length > 0 && (
        <p className={s.warnNote} role="note">
          {missing.length === data!.sheets.length
            ? tr('«{0}» талбар бөглөх хуудсуудад хараахан нэмэгдээгүй — зөвхөн харах горим. Админ талбарыг нэмэнгүүт засвар өөрөө нээгдэнэ.', 'bagts_hamaaral')
            : tr('«{0}» талбаргүй хуудас ({1}) — тэдгээрийн ажилд хамаарал хадгалах боломжгүй (зөвхөн харах): {2}', 'bagts_hamaaral', num(missing.length), missing.map((x) => x.pkg.label).join(', '))}
        </p>
      )}
      {failed.length > 0 && (
        <p className={s.failNote} role="alert">
          {tr('Уншигдаагүй хуудас ({0}) — дугуй хамаарлыг бүрэн шалгах боломжгүй тул хадгалахыг түр хаалаа: {1}', num(failed.length), failed.map((x) => x.pkg.label).join(', '))}
          {' '}<button type="button" className={s.retryBtn} onClick={reload}>{tr('Дахин оролдох')}</button>
        </p>
      )}
      {g.bad.length > 0 && (
        <p className={s.failNote} role="alert">
          {tr('Эвдэрсэн бичлэгтэй ажил ({0}) — тэдгээрийн хамаарлыг уншиж/засах боломжгүй, админд хандана уу: {1}', num(g.bad.length),
            g.bad.slice(0, 5).map((b) => { const n = g.nodes.get(b.id); return n ? `${pkgLabel(n.p)} · ${nodeLabel(n)}` : b.id; }).join('; '))}
        </p>
      )}
      {/* ⚠️ 2026-10-22 (аудит): алдаа ихэвчлэн «дахин ачаална уу» — товч нь ЭНД (урьд нь зөвхөн хуудас уншигдаагүй үед) */}
      {err && (
        <p className={s.failNote} role="alert">
          {err}{' '}<button type="button" className={s.retryBtn} disabled={busy} onClick={() => { setErr(''); reload(); }}>{tr('Дахин ачаалах')}</button>
        </p>
      )}
      {msg && !err && <p className={s.okNote} role="status">{msg}</p>}

      {orphans.length > 0 && (
        <section className={s.card}>
          <h2 className={s.cardTitle}>{tr('Өнчин холбоо ({0}) — урьдчилагч ажил нь олдохгүй байна', num(orphans.length))}</h2>
          <p className={s.note}>{tr('Ажлыг нээж холбоог устгах эсвэл зөв ажлаар солино уу.')}</p>
          <ul className={s.plainList}>
            {orphans.slice(0, 50).map(({ id, e }) => {
              const d = g.nodes.get(id);
              return (
                <li key={`${id}|${e.ref.p}|${e.ref.k}|${e.ref.o ?? 0}`} className={s.legacyRow}>
                  <button type="button" className={s.linkBtn} onClick={() => void openNode(id)}>
                    {d ? `${pkgLabel(d.p)} · ${nodeLabel(d)}` : id}
                  </button>
                  <span>← {pkgLabel(e.ref.p)} · {e.ref.k}</span>
                  <small className={s.mute}>{whyText(e)}</small>
                </li>
              );
            })}
          </ul>
          {orphans.length > 50 && <p className={s.note}>… +{num(orphans.length - 50)}</p>}
        </section>
      )}

      {/* ── Хуучин багц ↔ багц холбоос ── */}
      {legacyQ.state === 'error' && (
        <p className={s.failNote} role="alert">
          {tr('Хуучин багц хоорондын холбоо уншигдсангүй')}: {friendlyError(legacyQ.error)}
          {' '}<button type="button" className={s.retryBtn} onClick={() => legacyQ.retry?.()}>{tr('Дахин оролдох')}</button>
        </p>
      )}
      {legacy.length > 0 && (
        <section className={s.card}>
          <h2 className={s.cardTitle}>{tr('Хуучин багц хоорондын холбоо — ажлыг нь сонгож шилжүүлнэ үү')}</h2>
          <p className={s.note}>{tr('Ажлын холбоо хадгалагдмагц тухайн хуучин холбоо автоматаар устна.')}</p>
          <ul className={s.plainList}>
            {legacy.map((d) => {
              const ok = sheetsOfPkgKey(legacyPkgKey(d.from)).length > 0 && sheetsOfPkgKey(legacyPkgKey(d.to)).length > 0;
              return (
                <li key={`${d.from}>${d.to}`} className={s.legacyRow}>
                  <span><b>{legacyPkgKey(d.from) || d.from}</b> → <b>{legacyPkgKey(d.to) || d.to}</b></span>
                  {!ok && <small className={s.mute}>{tr('бөглөх хуудасгүй багц — шилжүүлэх боломжгүй')}</small>}
                  {canEdit && ok && (
                    <button type="button" className={s.ghostBtn} onClick={() => void migrate(d)}>{tr('Шилжүүлэх')}</button>
                  )}
                  {canEdit && !ok && (
                    <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { void removeLegacy(d); }}>{tr('Устгах')}</button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Багцын түвшний тойм ── */}
      <section className={s.card}>
        <h2 className={s.cardTitle}>{tr('Багц хоорондын тойм')}</h2>
        {pairs.length === 0 ? (
          <p className={s.note}>{tr('Ажлын холбоо хараахан бүртгэгдээгүй.')}</p>
        ) : (
          <div className={s.chips}>
            {pairs.map((x) => {
              const on = flt === x.from && pA === x.to;
              return (
                <button key={`${x.from}>${x.to}`} type="button" className={s.pairChip} aria-pressed={on}
                  title={tr('«{0}»-ийн ажлууд «{1}»-ийн ажлаас хамаарна', pkgLabel(x.to), pkgLabel(x.from))}
                  onClick={async () => {
                    if (on) { setFlt(null); return; }
                    if (!(await guard())) return; // ⚠️ 2026-10-23 (P8)
                    setPA(x.to); setPB(x.from); setFlt(x.from); setSel(null); setQA('');
                  }}>
                  {pkgLabel(x.from)} → {pkgLabel(x.to)}: <b>{tr('{0} холбоо', num(x.n))}</b>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Засвар: А → ажил → Б ── */}
      <div ref={editorRef} className={s.grid}>
        <section className={s.card}>
          <h2 className={s.cardTitle}>{tr('Хамаарах ажил (А)')}</h2>
          <div className={s.filters}>
            <select className={s.select} value={pA} aria-label={tr('Багц (А)')}
              onChange={(e) => {
                /* ⚠️ 2026-10-23 (P8): хадгалаагүй сонголттой бол асууна — болих үед утга хэвээр (удирдлагатай select) */
                const v = e.target.value;
                void guard().then((ok) => { if (ok) { setPA(v); setSel(null); setFlt(null); } });
              }}>
              {PKGS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <input className={s.search} type="search" value={qA} onChange={(e) => setQA(e.target.value)}
              placeholder={tr('Ажил хайх…')} aria-label={tr('Ажил хайх')} />
          </div>
          {flt && (
            <p className={s.note}>
              {tr('Зөвхөн «{0}»-ийн ажлаас хамаардаг ажлууд', pkgLabel(flt))}
              {' '}<button type="button" className={s.linkBtn} onClick={() => setFlt(null)}>{tr('Шүүлтүүр арилгах')}</button>
            </p>
          )}
          {!sheetOf.get(pA)?.field && sheetOf.get(pA) && !sheetOf.get(pA)!.error && (
            <p className={s.note}>{tr('Энэ хуудсанд «{0}» талбар алга — зөвхөн харах.', 'bagts_hamaaral')}</p>
          )}
          {sheetOf.get(pA)?.error && <p className={s.note}>{tr('Хуудас уншигдсангүй')}: {sheetOf.get(pA)!.error}</p>}
          <WorkPicker g={g} p={pA} q={qA} sel={sel} onSel={(id) => void pickWork(id)} flt={flt} />
        </section>

        <section ref={detailRef} className={s.card}>
          {!selNode ? (
            <p className={s.note}>{tr('Зүүн талаас ажил сонгоно уу.')}</p>
          ) : (
            <WorkDetail key={selNode.id} g={g} n={selNode} canWrite={canWriteA} busy={busy} pB={pB}
              setPB={(p) => { void guard().then((ok) => { if (ok) setPB(p); }); }}
              onSave={save} onOpen={(id) => void openNode(id)} onDirty={onPickDirty} />
          )}
        </section>
      </div>
    </div>
  );
}

/* ══════════════ А — ажил сонгох (хэсгээр) ══════════════ */

function WorkPicker({ g, p, q, sel, onSel, flt }: {
  g: WorkGraph; p: string; q: string; sel: NodeId | null; onSel: (id: NodeId) => void;
  /** Тоймын шүүлт — зөвхөн энэ хуудаснаас хамаардаг ажлууд */
  flt: string | null;
}) {
  const secs = useMemo(() => sectionsOf(g, p).map((sec) => ({
    ...sec,
    items: sec.items.filter((id) => {
      const n = g.nodes.get(id)!;
      if (!nodeMatches(n, q)) return false;
      if (!flt) return true;
      return (g.pre.get(id) ?? []).some((e) => edgePkg(g, e) === flt);
    }),
  })).filter((sec) => sec.items.length), [g, p, q, flt]);
  const narrow = !!q.trim() || !!flt;
  /* ⚠️ 2026-10-23 (UX аудит X6): хайлт/шүүлтээс болсон эсэхийг ИЛ хэлнэ */
  if (!secs.length) return <p className={s.note}>{narrow ? tr('Хайлт эсвэл шүүлтэд тохирох ажил алга — хайлтаа өөрчилнө үү.') : tr('Ажил олдсонгүй')}</p>;
  return (
    <div className={s.listBox}>
      {secs.map((sec) => {
        const head = sec.id ? g.nodes.get(sec.id) : null;
        const open = narrow || (!!sel && sec.items.includes(sel));
        return (
          <details key={sec.id ?? '-'} className={s.sec} open={open || undefined}>
            <summary className={s.secHead}>
              {head ? nodeLabel(head) : tr('Бүлэггүй ажлууд')} <small className={s.mute}>({num(sec.items.length)})</small>
            </summary>
            <ul className={s.plainList}>
              {sec.items.map((id) => {
                const n = g.nodes.get(id)!;
                const up = g.pre.get(id)?.length ?? 0;
                const down = g.post.get(id)?.length ?? 0;
                return (
                  <li key={id}>
                    <button type="button" className={s.workBtn} aria-pressed={sel === id} onClick={() => onSel(id)}>
                      <span>{nodeLabel(n)}</span>
                      {(up > 0 || down > 0) && (
                        <small className={s.counts} title={tr('Урьдчилагч · хамааралтай ажил')}>↑{num(up)} ↓{num(down)}</small>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

/* ══════════════ Сонгосон ажил — урьдчилагчид · хамааралтай · засвар ══════════════ */

function WorkDetail({ g, n, canWrite, busy, pB, setPB, onSave, onOpen, onDirty }: {
  g: WorkGraph; n: WNode; canWrite: boolean; busy: boolean;
  pB: string; setPB: (p: string) => void;
  onSave: (dep: WNode, c: RefChange) => Promise<boolean>;
  onOpen: (id: NodeId) => void;
  /** ⚠️ 2026-10-23 (P8): хадгалаагүй сонголтын тоо — эцэг асуулт/`navGuard`-д */
  onDirty: (n: number) => void;
}) {
  const edges = useMemo(() => g.pre.get(n.id) ?? [], [g, n.id]);
  const byPkg = useMemo(() => {
    const m = new Map<string, Edge[]>();
    for (const e of edges) {
      const k = edgePkg(g, e);
      const l = m.get(k);
      if (l) l.push(e); else m.set(k, [e]);
    }
    return [...m.entries()];
  }, [g, edges]);
  const deps = g.post.get(n.id) ?? [];
  const otherPkgs = PKGS.filter((p) => p.key !== n.p);
  const b = otherPkgs.some((p) => p.key === pB) ? pB : '';

  return (
    <>
      <p className={s.eyebrow}>{pkgLabel(n.p)}</p>
      <h2 className={s.cardTitle}>{nodeLabel(n)}</h2>

      <h3 className={s.subTitle}>{tr('Хамаардаг ажлууд (урьдчилагч)')} <small className={s.mute}>({num(edges.length)})</small></h3>
      {byPkg.length === 0 && <p className={s.note}>—</p>}
      {byPkg.map(([p, list]) => (
        <div key={p} className={s.pkgGroup}>
          <b className={s.pkgName}>{pkgLabel(p)}</b>
          <span className={s.chips}>
            {list.map((e) => {
              const t = e.to ? g.nodes.get(e.to) : null;
              const label = t ? nodeLabel(t) : e.ref.k;
              return (
                <span key={`${e.ref.p}|${e.ref.k}|${e.ref.o ?? 0}`} className={t ? s.chip : s.chipBad} title={t ? undefined : whyText(e)}>
                  {t ? (
                    <button type="button" className={s.chipLink} onClick={() => onOpen(t.id)}>{label}</button>
                  ) : (
                    <span className={s.chipLink}>{label} <small>({whyText(e)})</small></span>
                  )}
                  {canWrite && (
                    <button type="button" className={s.chipX} disabled={busy} title={tr('Холбоо устгах')} aria-label={tr('Холбоо устгах')}
                      onClick={async () => {
                        /* ⚠️ Жижиг ✕ дээр андуурч дарахаас хамгаална (хуучин модулийн 2026-10-05 ⚠️).
                           ⚠️ 2026-10-23 (UX аудит P7): асуултын ОРОНД «↶ Буцаах» мэдэгдэл — устгаад, буцаавал ИЖИЛ холбоог
                              (`e.ref`) дахин нэмнэ. Хамгаалалтын зорилго хэвээр, нэг товшилт илүү. */
                        if (!(await onSave(n, { add: [], remove: [e.ref] }))) return;
                        void toastUndo(tr('«{0}» холбоо устгагдлаа.', label), () => { void onSave(n, { add: [e.ref], remove: [] }); });
                      }}>✕</button>
                  )}
                </span>
              );
            })}
          </span>
        </div>
      ))}

      <h3 className={s.subTitle}>{tr('Энэ ажлаас хамаардаг ажлууд')} <small className={s.mute}>({num(deps.length)})</small></h3>
      {deps.length === 0 ? <p className={s.note}>—</p> : (
        <span className={s.chips}>
          {deps.map((id) => {
            const d = g.nodes.get(id);
            if (!d) return null;
            return (
              <span key={id} className={s.chip}>
                <button type="button" className={s.chipLink} onClick={() => onOpen(id)}><b>{pkgLabel(d.p)}</b> {nodeLabel(d)}</button>
              </span>
            );
          })}
        </span>
      )}

      {canWrite && (
        <div className={s.editBox}>
          <h3 className={s.subTitle}>{tr('Урьдчилагч нэмэх / засах')}</h3>
          <select className={s.select} value={b} onChange={(e) => setPB(e.target.value)} aria-label={tr('Урьдчилагчийн багц (Б)')}>
            <option value="">{tr('Багц сонгох (Б)…')}</option>
            {otherPkgs.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          {b && <PrereqPicker key={`${n.id}|${b}`} g={g} n={n} p={b} busy={busy} onSave={onSave} onDirty={onDirty} />}
        </div>
      )}
    </>
  );
}

/* ══════════════ Б — урьдчилагч сонгох (checkbox) ══════════════ */

function PrereqPicker({ g, n, p, busy, onSave, onDirty }: {
  g: WorkGraph; n: WNode; p: string; busy: boolean;
  onSave: (dep: WNode, c: RefChange) => Promise<boolean>;
  onDirty: (n: number) => void;
}) {
  const [q, setQ] = useState('');
  /* Б-гийн одоо холбогдсон ажлууд (тулгагдсан) — тэдгээрийн хадгалсан холбоос (`ref`) хасахад */
  const cur = useMemo(() => {
    const m = new Map<NodeId, Edge>();
    for (const e of g.pre.get(n.id) ?? []) if (e.to && g.nodes.get(e.to)?.p === p) m.set(e.to, e);
    return m;
  }, [g, n.id, p]);
  /**
   * Хүлээгдэж буй сонголт — ЭНЭ графын агшинд (`base`). Хадгалсны дараа шинэ граф ирэхэд (`base !== g`) хаягдаж,
   * серверийн төлөв харагдана; түүнээс өмнө хэрэглэгчийн сонголт хэвээр (анивчихгүй).
   */
  const [pick, setPick] = useState<{ base: WorkGraph; set: Set<NodeId> } | null>(null);
  const chosen = pick && pick.base === g ? pick.set : new Set(cur.keys());
  const toggle = (ids: NodeId[], on: boolean) => {
    const next = new Set(chosen);
    for (const id of ids) { if (on) next.add(id); else next.delete(id); }
    setPick({ base: g, set: next });
  };
  /* ⚠️ Дугуйн шалгалт НЭГ давалтаар (`dependentsOf` ≡ `linkError`-ийн дугуй) — 1,500 мөрд мөр бүрээр DFS хийхгүй */
  const loop = useMemo(() => dependentsOf(g, n.id), [g, n.id]);
  const errOf = useCallback((id: NodeId) => (cur.has(id) || !loop.has(id) ? null
    : tr('Дугуй хамаарал үүснэ — тэр ажил энэ ажлаас (дамжуулан) хамаардаг')), [cur, loop]);
  const secs = useMemo(() => sectionsOf(g, p).map((sec) => ({
    ...sec, items: sec.items.filter((id) => nodeMatches(g.nodes.get(id)!, q)),
  })).filter((sec) => sec.items.length), [g, p, q]);
  const add = [...chosen].filter((id) => !cur.has(id));
  const rm = [...cur.keys()].filter((id) => !chosen.has(id));
  const dirty = add.length + rm.length > 0;
  const narrow = !!q.trim();
  /* ⚠️ 2026-10-23 (UX аудит P8): хадгалаагүй тоог эцэгт мэдэгдэнэ; салахад (өөр ажил/багц) 0 */
  const dirtyN = add.length + rm.length;
  useEffect(() => { onDirty(dirtyN); }, [dirtyN, onDirty]);
  useEffect(() => () => onDirty(0), [onDirty]);

  return (
    <div className={s.pickBox}>
      <input className={s.search} type="search" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={tr('Ажил хайх…')} aria-label={tr('Урьдчилагч ажил хайх')} />
      <div className={s.listBox}>
        {secs.length === 0 && <p className={s.note}>{tr('Ажил олдсонгүй')}</p>}
        {secs.map((sec) => {
          const head = sec.id ? g.nodes.get(sec.id) : null;
          const free = sec.items.filter((id) => !errOf(id));
          const all = free.length > 0 && free.every((id) => chosen.has(id));
          const any = sec.items.some((id) => chosen.has(id));
          return (
            <details key={sec.id ?? '-'} className={s.sec} open={narrow || any || undefined}>
              <summary className={s.secHead}>
                {head ? nodeLabel(head) : tr('Бүлэггүй ажлууд')} <small className={s.mute}>({num(sec.items.length)})</small>
              </summary>
              <label className={s.checkRow}>
                <input type="checkbox" checked={all} disabled={busy || !free.length} onChange={(e) => toggle(free, e.target.checked)} />
                <span className={s.mute}>{tr('Энэ хэсгийн бүгдийг сонгох')}</span>
              </label>
              {sec.items.map((id) => {
                const w = g.nodes.get(id)!;
                const e = errOf(id);
                return (
                  <label key={id} className={s.checkRow} title={e ?? undefined}>
                    <input type="checkbox" checked={chosen.has(id)} disabled={busy || (!!e && !chosen.has(id))}
                      onChange={(ev) => toggle([id], ev.target.checked)} />
                    <span className={e && !chosen.has(id) ? s.mute : undefined}>{nodeLabel(w)}</span>
                  </label>
                );
              })}
            </details>
          );
        })}
      </div>
      <div className={s.addRow}>
        <button type="button" className={s.primaryBtn} disabled={!dirty || busy}
          onClick={() => {
            void onSave(n, {
              add: add.map((id) => refOf(g.nodes.get(id)!)),
              remove: rm.map((id) => cur.get(id)!.ref),
            });
          }}>
          {busy ? tr('Хадгалж байна…') : tr('Хадгалах (+{0} / −{1})', num(add.length), num(rm.length))}
        </button>
        {dirty && <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => setPick(null)}>{tr('Болих')}</button>}
      </div>
    </div>
  );
}
