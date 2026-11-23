'use client';

/**
 * «БАГЦЫН ХАМААРАЛ» — БАГЦ ХООРОНДЫН АЖЛЫН ХАМААРАЛ (2026-10-22, дахин бүтээв).
 *
 * 2026-11-23 (хэрэглэгч: «SS FS гэж хамааруулдгийг бүрэн хасаж зөвхөн бүлгээр хамаарал хийдэг болго», «bar нь хугацаа
 * биш ажлын нэрүүд байж болохоор багцууд арагш цуварна, харин хооронд нь холбоно») — уялдааны төрөл · хоног ХАСАГДСАН.
 * Багц бүр нэг БАГАНА (зүүнээс баруун тийш цуварна), багана дотор 3-р давхрын бүлгүүд нэрээрээ хайрцаг болж, холбоо нь
 * хайрцаг хоорондын сумаар харагдана:
 *
 *   ┌ Багц-1 · 9 давхар ┐        ┌ Багц-5.1 ─────────┐
 *   │ Б1 · Суурь        │───────▶│ Б1 · Шугам        │
 *   │ Б1 · Рам          │        │ Б2 · Худаг        │
 *   └───────────────────┘        └───────────────────┘
 *
 * «Засах» → хайрцаг сонгоод түүнтэй холбох (эсвэл холбоог арилгах) хайрцгуудыг дараалан дарна → «Хадгалах» (бүгд нэг дор).
 *
 * 2026-11-23 (3): «зөвхөн хамааруулна, урд хойдох ажлын хуваариас хамаарна, хуваарь ард нь байхад хамаарлаар урд нь гэж
 * буруу болох магадлалтай, зөвхөн хамаарал» — ЧИГЛЭЛГҮЙ: урьдчилагч/хамаарах гэж ялгахгүй, «холбоотой» л. Дараалал нь
 * «Хуваарь»-аас. Бичлэгт холбоо нэг талын мөрд (бичих боломжтой хуудас) хадгалагдах ч утга нь хоёр талдаа ижил.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t as tr } from '@/lib/i18nCore';
import { num } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { PKGS } from '@/modules/sheet/bagts.pkg';
import { bagtsKey } from '@/lib/services';
import {
  legacyCovered, legacyPkgKey, linkError, linkableIds, pkgPairs, refOf,
  type Edge, type NodeId, type WNode, type WorkGraph, type WorkRef,
} from '@/lib/workDeps';
import { dropWorkCache, loadWorkData, saveWorkLinks, sheetsOfPkgKey } from '@/lib/workDepsRemote';
import { loadLegacyDeps, removeLegacyDeps, type Dep } from '@/lib/bagtsHamaaral';
import { useAuth } from '@/components/AuthGate';
import { friendlyError, userError, Loading } from '@/components/ui';
import { askConfirm } from '@/lib/confirm';
import { setNavDirty } from '@/lib/navGuard';
import s from './bagtsHamaaral.module.css';


/**
 * Хуучин холбооны түлхүүрийн дэлгэцийн нэр — бөглөх хуудасны багцын бүлэг (`PKGS.group`), орчуулсан.
 */
const legacyLabel = (k: string): string => {
  const key = legacyPkgKey(k);
  const p = key ? PKGS.find((x) => bagtsKey(x.group) === key) : undefined;
  return p ? tr(p.group) : (key || k);
};

const pkgLabel = (p: string): string => PKGS.find((x) => x.key === p)?.label ?? p;
const nodeLabel = (n: Pick<WNode, 'path' | 'work'> & { group?: boolean }): string =>
  `${n.path.map((x) => x.trim() || tr('(нэргүй бүлэг)')).join(' → ')} «${n.work.trim() || (n.group ? tr('(нэргүй бүлэг)') : tr('(нэргүй ажил)'))}»`;
/** Зурвасын мөрийн богино нэр — № · нэр */
const shortLabel = (n: WNode): string => `${n.no.trim() ? `${n.no.trim()} · ` : ''}${n.work.trim() || tr('(нэргүй бүлэг)')}`;
const whyText = (e: Edge): string => (e.why === 'unloaded'
  ? tr('хуудас уншигдаагүй')
  : e.why === 'ambiguous'
    ? tr('ижил нэртэй мөр нэмэгдсэн/хасагдсан — аль нь болохыг тодорхойлж чадсангүй')
    : tr('ажил олдсонгүй (устсан эсвэл нэр нь өөрчлөгдсөн)'));

/**
 * Харагдах холбоо (чиглэлгүй) — хадгалсан (`saved`), хадгалахаар нэмсэн (`add`), устгахаар тэмдэглэсэн (`del`).
 * `host` — холбоосыг хадгалдаг мөр (бичлэг нэг талд), `ref` — тэр мөрийн бичлэг дэх холбоос.
 */
type Line = { key: string; pair: string; a: NodeId; b: NodeId; host: NodeId; ref: WorkRef; kind: 'saved' | 'add' | 'del' };
/** Өнчин холбоос — нөгөө тал нь олдохгүй (зөвхөн устгаж болно) */
type Orphan = { key: string; host: NodeId; e: Edge; del: boolean };
const pairOf = (a: NodeId, b: NodeId): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const refKeyOf = (r: WorkRef): string => `${r.p}|${r.k}|${r.o ?? 0}`;

export function BagtsHamaaral() {
  const dataQ = useAsync(loadWorkData, []);
  const legacyQ = useAsync(loadLegacyDeps, []);
  const { user } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `capN` нь эрх өөрчлөгдсөн дохио (`Zovshoorol`-той ижил)
  const canEdit = useMemo(() => hasCap(user?.username, 'hamaaral'), [user, capN]);

  /**
   * 2026-11-23 (хэрэглэгч: «хамаарал гэсэн ганцхан хэсэг байхад болно, бүх багц шууд харагдана, засах дарж холбоно, засна;
   * бусад үед бүх багц холбоосоор харагдаж байна — маш энгийн») — БҮХ хуудас багана болж шууд харагдана; таб · багц
   * сонгогч · хайлт · хүснэгт · эрсдэл хасагдсан.
   */
  const shown = useMemo(() => PKGS.map((x) => x.key), []);
  const [sel, setSel] = useState<NodeId | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  /** ЗАСАХ ГОРИМ (2026-11-23: «засах болон хадгалах товчтой болго») — өөрчлөлт «Хадгалах» дарах хүртэл зөвхөн энд */
  const [editing, setEditing] = useState(false);
  const [adds, setAdds] = useState<Line[]>([]);
  /** Устгахаар тэмдэглэсэн холбоос — түлхүүр → хадгалдаг мөр */
  const [dels, setDels] = useState<Map<string, NodeId>>(() => new Map());
  /** «↶ Буцаах» — өөрчлөлт бүрийн өмнөх төлөв (сүүлийнхээс нь буцаана) */
  const [hist, setHist] = useState<{ adds: Line[]; dels: Map<string, NodeId> }[]>([]);
  const ganttRef = useRef<HTMLElement | null>(null);
  /** Үр дүнгийн мэдэгдэл — гарахад харагдах хэсэгт гүйлгэнэ */
  const noteRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => { if (err || msg) noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [err, msg]);

  const data = dataQ.state === 'ready' ? dataQ.data : null;
  const g = data?.graph ?? null;
  const sheetOf = useMemo(() => new Map((data?.sheets ?? []).map((x) => [x.pkg.key, x] as const)), [data]);
  const pairs = useMemo(() => (g ? pkgPairs(g) : []), [g]);
  const total = useMemo(() => (g ? [...g.pre.values()].reduce((a, e) => a + e.filter((x) => x.to).length, 0) : 0), [g]);
  const failed = useMemo(() => (data?.sheets ?? []).filter((x) => x.error), [data]);
  const missing = useMemo(() => (data?.sheets ?? []).filter((x) => !x.error && !x.field), [data]);
  /** Хуудсанд бичих боломж (талбартай · бүх хуудас уншигдсан · эрхтэй) */
  const canWriteSheet = useCallback((p: string) => canEdit && !!sheetOf.get(p)?.field, [canEdit, sheetOf]);
  const selNode = g && sel ? g.nodes.get(sel) ?? null : null;

  /* ── Хадгалсан холбоо + засварын өөрчлөлт ── */
  const saved = useMemo<Line[]>(() => (g ? [...g.pre].flatMap(([host, es]) => es.flatMap((e) => (e.to
    ? [{ key: `${host}#${refKeyOf(e.ref)}`, pair: pairOf(host, e.to), a: host, b: e.to, host, ref: e.ref, kind: 'saved' as const }]
    : []))) : []), [g]);
  const orphans = useMemo<Orphan[]>(() => (g ? [...g.pre].flatMap(([host, es]) => es.filter((e) => !e.to)
    .map((e) => ({ key: `${host}#${refKeyOf(e.ref)}`, host, e, del: dels.has(`${host}#${refKeyOf(e.ref)}`) }))) : []), [g, dels]);
  const lines = useMemo<Line[]>(() => [
    ...saved.map((l) => (dels.has(l.key) ? { ...l, kind: 'del' as const } : l)),
    ...adds,
  ], [saved, adds, dels]);
  const dirty = adds.length + dels.size;
  /*
   * Граф шинэчлэгдэхэд (хадгалсны дараа · «Дахин ачаалах» · бусдын засвар) — аль хэдийн хадгалагдсан нэмэлт, алга болсон
   * холбоосын устгалтыг хүлээгдэж буйгаас хасна; буцаах түүх хуучирсан тул цэвэрлэнэ (хуурамч «−N» · давхар «нэмэх» гарахгүй).
   */
  const [seenG, setSeenG] = useState(g);
  if (g !== seenG) {
    setSeenG(g);
    const alive = new Set(g ? [...g.pre].flatMap(([host, es]) => es.map((e) => `${host}#${refKeyOf(e.ref)}`)) : []);
    const savedPairs = new Set(saved.map((l) => l.pair));
    if ([...dels.keys()].some((k) => !alive.has(k))) setDels(new Map([...dels].filter(([k]) => alive.has(k))));
    if (adds.some((l) => savedPairs.has(l.pair))) setAdds(adds.filter((l) => !savedPairs.has(l.pair)));
    if (hist.length) setHist([]);
  }
  useEffect(() => {
    setNavDirty('hamaaral-edit', dirty > 0, tr('Хадгалаагүй холбоо'));
  }, [dirty]);
  useEffect(() => () => setNavDirty('hamaaral-edit', false), []);

  /* ── Хуучин багц ↔ багц холбоос (шилжүүлэлт) ── */
  const legacy = useMemo<Dep[]>(() => (legacyQ.state === 'ready' ? legacyQ.data.deps : []), [legacyQ]);
  const retryLegacy = legacyQ.retry;
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!canEdit || !g || legacyQ.state !== 'ready') return;
    const cov = legacy.filter((d) => (legacyCovered(pairs, d, sheetsOfPkgKey) || legacyCovered(pairs, { ...d, from: d.to, to: d.from }, sheetsOfPkgKey)) && !tried.current.has(`${d.from}>${d.to}`));
    if (!cov.length) return;
    for (const d of cov) tried.current.add(`${d.from}>${d.to}`);
    void removeLegacyDeps(cov).then((r) => {
      if (r.ok) retryLegacy?.();
      else setErr(userError(r.error));
    });
  }, [canEdit, g, legacyQ.state, legacy, pairs, retryLegacy]);

  const removeLegacy = useCallback(async (d: Dep) => {
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

  /** Хуучин холбоог шилжүүлэх — багануудын хэсэг рүү гүйлгэнэ (бүх багц харагдаж байгаа) */
  const migrate = useCallback((d: Dep) => {
    const pre = sheetsOfPkgKey(legacyPkgKey(d.from));
    const post = sheetsOfPkgKey(legacyPkgKey(d.to));
    if (!pre.length || !post.length) return;
    /* Хуучин холбооны эхний багцын багана руу гүйлгэнэ — тэндээс «Засах»-аар бүлгүүдийг холбоно (холбоо чиглэлгүй тул аль
       талынх ч хамаагүй, `legacyCovered` хоёр чиглэлийг шалгана) */
    setSel(null);
    setTimeout(() => {
      ganttRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelector(`section[data-p="${CSS.escape(pre[0])}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }, 80);
  }, []);

  const reload = useCallback(() => { dropWorkCache(); dataQ.retry?.(); }, [dataQ]);

  /**
   * Засах горимд `a` ↔ `b`-г СЭЛГЭНЭ: шинэ нэмэлт бол буцаана, хадгалсан бол устгахаар тэмдэглэнэ/буцаана, эс бөгөөс нэмнэ.
   * Нэмэхэд аль нэг талын бичих боломжтой мөрд хадгална (эхлээд `a`).
   */
  const toggle = useCallback((a: WNode, b: WNode) => {
    setErr('');
    setMsg('');
    const pk = pairOf(a.id, b.id);
    const snap = { adds, dels };
    if (adds.some((l) => l.pair === pk)) { setHist((h) => [...h, snap]); setAdds(adds.filter((l) => l.pair !== pk)); return; }
    const had = saved.filter((l) => l.pair === pk);
    if (had.length) {
      const allDel = had.every((l) => dels.has(l.key));
      const nx = new Map(dels);
      for (const l of had) { if (allDel) nx.delete(l.key); else nx.set(l.key, l.host); }
      setHist((h) => [...h, snap]);
      setDels(nx);
      return;
    }
    const [host, other] = canWriteSheet(a.p) ? [a, b] : canWriteSheet(b.p) ? [b, a] : [null, null];
    if (!host || !other) { setErr(tr('«{0}» ба «{1}» хуудсанд холбоо хадгалах боломжгүй (талбаргүй эсвэл эрхгүй).', pkgLabel(a.p), pkgLabel(b.p))); return; }
    if (g) {
      const why = linkError(g, host.id, other.id);
      if (why) { setErr(why); return; }
    }
    const ref = refOf(other);
    setHist((h) => [...h, snap]);
    setAdds([...adds, { key: `+${host.id}#${refKeyOf(ref)}`, pair: pk, a: a.id, b: b.id, host: host.id, ref, kind: 'add' }]);
  }, [g, adds, saved, dels, canWriteSheet]);

  /** Зураас дарахад (засах горимд) — тэр хоёр бүлгийн холбоог сэлгэнэ (салгах / буцаах) */
  const toggleLine = useCallback((a: NodeId, b: NodeId) => {
    const na = g?.nodes.get(a);
    const nb = g?.nodes.get(b);
    if (na && nb) toggle(na, nb);
  }, [g, toggle]);

  /** «↶ Буцаах» — сүүлийн өөрчлөлтийг цуцална */
  const undo = useCallback(() => {
    const last = hist[hist.length - 1];
    if (!last) return;
    setAdds(last.adds);
    setDels(last.dels);
    setHist(hist.slice(0, -1));
  }, [hist]);

  /** Өнчин холбоосыг устгахаар тэмдэглэх/буцаах */
  const toggleOrphan = useCallback((o: Orphan) => {
    const nx = new Map(dels);
    if (nx.has(o.key)) nx.delete(o.key); else nx.set(o.key, o.host);
    setHist((h) => [...h, { adds, dels }]);
    setDels(nx);
  }, [adds, dels]);

  /** Хайрцаг дарахад — сонгоно; засах горимд сонгосон бүлэгтэй холбоог сэлгэнэ (сонголт хэвээр — дараалан холбоно) */
  const onPick = useCallback((id: NodeId) => {
    if (!g) return;
    const n = g.nodes.get(id);
    if (!n) return;
    if (editing && selNode && id !== selNode.id) { toggle(selNode, n); return; }
    setSel((cur) => (cur === id ? null : id));
  }, [g, editing, selNode, toggle]);

  /** Жагсаалтаас (холбоотой · өнчин) бүлэг рүү очих — багц нь харагдахгүй бол нэмнэ */
  const focusNode = useCallback((id: NodeId) => {
    const n = g?.nodes.get(id);
    if (!n) return;
    setSel(id);
    setTimeout(() => document.getElementById(`ham-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }, [g]);

  /* Esc — сонголтоо болиулна (засах горимд өөр бүлгийг үндэс болгож сонгохын тулд) */
  useEffect(() => {
    if (!sel) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  const startEdit = useCallback(() => { setErr(''); setMsg(''); setEditing(true); }, []);
  const cancelEdit = useCallback(async () => {
    if (dirty && !(await askConfirm(tr('Хадгалаагүй {0} өөрчлөлт хаягдана. Үргэлжлүүлэх үү?', num(dirty)), { danger: true, ok: tr('Хаях') }))) return;
    setAdds([]);
    setDels(new Map());
    setHist([]);
    setEditing(false);
  }, [dirty]);

  /**
   * ХАДГАЛАХ — өөрчлөлтийг хадгалдаг мөрөөр нь бүлэглэж мөр бүрд нэг удаа бичнэ (`saveWorkLinks` — сүүлийн өгөгдлийг
   * дахин уншиж, бусдын зэрэгцээ засварыг дарахгүй). Амжилттай мөрийн өөрчлөлт цэвэрлэгдэж, унасных нь үлдэнэ.
   */
  const saveAll = useCallback(async () => {
    if (!g || busy || !dirty) return;
    const byHost = new Map<NodeId, { add: WorkRef[]; remove: WorkRef[] }>();
    const at = (h: NodeId) => { let c = byHost.get(h); if (!c) { c = { add: [], remove: [] }; byHost.set(h, c); } return c; };
    for (const l of adds) at(l.host).add.push(l.ref);
    for (const l of saved) if (dels.has(l.key)) at(l.host).remove.push(l.ref);
    for (const o of orphans) if (o.del) at(o.host).remove.push(o.e.ref);
    setBusy(true);
    setErr('');
    setMsg('');
    const bad = new Set<NodeId>();
    const errs: string[] = [];
    let wrote = 0;
    try {
      for (const [h, change] of byHost) {
        const n = g.nodes.get(h);
        if (!n) continue;
        try {
          const r = await saveWorkLinks(refOf(n), change);
          if (!r.ok) { bad.add(h); errs.push(`${pkgLabel(n.p)} · ${shortLabel(n)}: ${userError(r.error)}`); } else wrote += 1;
        } catch (e) {
          bad.add(h);
          errs.push(`${pkgLabel(n.p)} · ${shortLabel(n)}: ${userError(e)}`);
        }
      }
    } finally {
      setBusy(false);
    }
    setAdds((cur) => cur.filter((l) => bad.has(l.host)));
    /* Хэсэгчлэн хадгалагдсан ч түүх хуучирна — буцаахад хадгалагдсан өөрчлөлт сэргэхгүй */
    setHist([]);
    setDels((cur) => new Map([...cur].filter(([, h]) => bad.has(h))));
    if (errs.length) setErr(tr('Хадгалагдаагүй ({0}): {1}', num(errs.length), errs.join(' · ')));
    else { setMsg(tr('Хадгалагдлаа ({0} бүлэг)', num(wrote))); setEditing(false); setHist([]); }
    if (wrote) reload();
  }, [g, busy, dirty, adds, saved, dels, orphans, reload]);

  if (dataQ.state === 'loading') return <div className={s.wrap}><Loading /></div>;
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

  const nAdd = adds.length;
  const nDel = dels.size;

  return (
    <div className={s.wrap}>
      <section className={s.hero}>
        <p className={s.eyebrow}>{tr('ТУХ · багцын хяналт')}</p>
        <h1>{tr('Багцын хамаарал')} <small className={s.total}>{tr('{0} холбоо', num(total))}</small></h1>
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
          {tr('Уншигдаагүй хуудас ({0}) — тэдгээрийн бүлгүүд харагдахгүй, холбох боломжгүй: {1}', num(failed.length), failed.map((x) => x.pkg.label).join(', '))}
          {' '}<button type="button" className={s.retryBtn} onClick={reload}>{tr('Дахин оролдох')}</button>
        </p>
      )}
      {g.bad.length > 0 && (
        <p className={s.failNote} role="alert">
          {tr('Эвдэрсэн бичлэгтэй ажил ({0}) — тэдгээрийн хамаарлыг уншиж/засах боломжгүй, админд хандана уу: {1}', num(g.bad.length),
            g.bad.slice(0, 5).map((b) => { const n = g.nodes.get(b.id); return n ? `${pkgLabel(n.p)} · ${nodeLabel(n)}` : b.id; }).join('; '))}
        </p>
      )}

      {orphans.length > 0 && (
        <section className={s.card}>
          <h2 className={s.cardTitle}>{tr('Өнчин холбоо ({0}) — холбосон бүлэг нь олдохгүй байна', num(orphans.length))}</h2>
          <p className={s.note}>{tr('Бүлгийг нээж холбоог устгах эсвэл зөв бүлгээр солино уу.')}</p>
          <ul className={s.plainList}>
            {orphans.slice(0, 50).map((o) => {
              const d = g.nodes.get(o.host);
              return (
                <li key={o.key} className={s.legacyRow}>
                  <button type="button" className={s.linkBtn} onClick={() => focusNode(o.host)}>
                    {d ? `${pkgLabel(d.p)} · ${nodeLabel(d)}` : o.host}
                  </button>
                  <span>↔ {pkgLabel(o.e.ref.p)} · {o.e.ref.k}</span>
                  <small className={s.mute}>{whyText(o.e)}</small>
                </li>
              );
            })}
          </ul>
          {orphans.length > 50 && <p className={s.note}>… +{num(orphans.length - 50)}</p>}
        </section>
      )}

      {/* ── Хуучин багц ↔ багц холбоос ── */}
      {legacy.length > 0 && (
        <section className={s.card}>
          <h2 className={s.cardTitle}>{tr('Хуучин багц хоорондын холбоо — бүлгээр нь холбож шилжүүлнэ үү')}</h2>
          <p className={s.note}>{tr('Бүлгийн холбоо хадгалагдмагц тухайн хуучин холбоо автоматаар устна.')}</p>
          <ul className={s.plainList}>
            {legacy.map((d) => {
              const ok = sheetsOfPkgKey(legacyPkgKey(d.from)).length > 0 && sheetsOfPkgKey(legacyPkgKey(d.to)).length > 0;
              return (
                <li key={`${d.from}>${d.to}`} className={s.legacyRow}>
                  <span><b>{legacyLabel(d.from)}</b> → <b>{legacyLabel(d.to)}</b></span>
                  {!ok && <small className={s.mute}>{tr('бөглөх хуудасгүй багц — шилжүүлэх боломжгүй')}</small>}
                  {canEdit && ok && (
                    <button type="button" className={s.ghostBtn} onClick={() => migrate(d)}>{tr('Шилжүүлэх')}</button>
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

      {/* ── Багцууд багана болж цуварна · бүлгүүд хооронд нь зураасаар ── */}
      <section ref={ganttRef} className={s.card}>
        <div className={s.ganttTools}>
          <div className={s.toolHead}>
            <span />
            {/* Засах · Хадгалах · Болих */}
            <div className={s.addRow}>
              {!editing ? (
                <button type="button" className={s.primaryBtn} disabled={!canEdit} onClick={startEdit}
                  title={!canEdit ? tr('Багцын хамаарал засах эрхгүй') : undefined}>
                  {tr('Засах')}
                </button>
              ) : (
                <>
                  <button type="button" className={s.primaryBtn} disabled={busy || !dirty} onClick={() => { void saveAll(); }}>
                    {busy ? tr('Хадгалж байна…') : tr('Хадгалах (+{0} / −{1})', num(nAdd), num(nDel))}
                  </button>
                  <button type="button" className={s.ghostBtn} disabled={busy || !hist.length} onClick={undo}
                    title={tr('Сүүлийн өөрчлөлтийг цуцлах')}>{tr('↶ Буцаах')}</button>
                  <button type="button" className={s.ghostBtn} disabled={busy} onClick={() => { void cancelEdit(); }}>{tr('Болих')}</button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Үр дүн — хайрцгуудын ДЭРГЭД (хуудасны дээд хэсэгт гарвал харагдахгүй байв) */}
        {err && (
          <p ref={noteRef} className={s.failNote} role="alert">
            {err}{' '}<button type="button" className={s.retryBtn} disabled={busy} onClick={() => { setErr(''); reload(); }}>{tr('Дахин ачаалах')}</button>
          </p>
        )}
        {msg && !err && <p ref={noteRef} className={s.okNote} role="status">{msg}</p>}
        {editing && (
          <p className={s.modeNote} role="status">
            {selNode
              ? tr('«{0}»-тэй холбох (эсвэл холбоог арилгах) бүлгүүдийг дараалан дарна уу. Дуусаад «Хадгалах».', shortLabel(selNode))
              : tr('Засах горим: эхлээд бүлэг сонгоод, түүнтэй холбох бүлгүүдийг дарна уу.')}
            {' '}{tr('Буруу холбоог салгахдаа зураас дээр нь эсвэл баруун талын «Салгах» дарна.')}
            {selNode && <>{' '}<button type="button" className={s.linkBtn} onClick={() => setSel(null)}>{tr('Сонголтоо болих (Esc)')}</button></>}
          </p>
        )}

        <div className={s.ganttWrap}>
          <Lanes g={g} shown={shown} sel={sel} editing={editing} busy={busy} lines={lines} onPick={onPick} onLine={toggleLine} />
          {selNode && (
            <SelPanel g={g} n={selNode} editing={editing} busy={busy} lines={lines} orphans={orphans.filter((o) => o.host === selNode.id)}
              onToggle={(other) => toggle(selNode, other)} onToggleOrphan={toggleOrphan}
              onFocus={focusNode} onClose={() => setSel(null)} />
          )}
        </div>
      </section>
    </div>
  );
}

/* ══════════════ Багцууд баруун тийш багана болж цуварна · бүлгүүд хооронд нь зураасаар ══════════════ */

type Item = { kind: 'sec'; id: string; label: string } | { kind: 'node'; n: WNode };

function Lanes({ g, shown, sel, editing, busy, lines, onPick, onLine }: {
  g: WorkGraph; shown: string[]; sel: NodeId | null; editing: boolean; busy: boolean; lines: Line[];
  onPick: (id: NodeId) => void;
  /** Засах горимд зураас дарахад — тэр хосын холбоог сэлгэнэ */
  onLine: (a: NodeId, b: NodeId) => void;
}) {
  /* Багц бүр нэг багана: хэсгийн гарчиг (Б1 · Б2 …) ба холбож болох бүлгүүд, хуудасны дарааллаар */
  const cols = useMemo(() => shown.map((p) => {
    const ok = linkableIds(g, p);
    const items: Item[] = [];
    let last: NodeId | null | undefined;
    for (const id of g.bySheet.get(p) ?? []) {
      if (!ok.has(id)) continue;
      const n = g.nodes.get(id)!;
      if (n.parent !== last) {
        last = n.parent;
        const par = n.parent ? g.nodes.get(n.parent) : null;
        if (par && !ok.has(par.id)) items.push({ kind: 'sec', id: `${p}|${par.id}`, label: nodeLabel(par) });
      }
      items.push({ kind: 'node', n });
    }
    return { p, items };
  }), [g, shown]);

  const linked = useMemo(() => {
    if (!sel) return new Set<NodeId>();
    return new Set(lines.filter((l) => l.kind !== 'del' && (l.a === sel || l.b === sel)).map((l) => (l.a === sel ? l.b : l.a)));
  }, [lines, sel]);
  /** Бүлэг бүрийн холбооны тоо (хос нэг удаа, устгахаар тэмдэглэснийг оруулахгүй) — карт дээрх «↔N» */
  const counts = useMemo(() => {
    const seen = new Set<string>();
    const m = new Map<NodeId, number>();
    for (const l of lines) {
      if (l.kind === 'del' || seen.has(l.pair)) continue;
      seen.add(l.pair);
      m.set(l.a, (m.get(l.a) ?? 0) + 1);
      m.set(l.b, (m.get(l.b) ?? 0) + 1);
    }
    return m;
  }, [lines]);
  /*
   * Зураас — холбосон бүх холбоо БАЙНГА харагдана (2026-11-23: «өөр ажил хийхэд холбоос харагдахаа больж байна, холбосон бол
   * энэ маягаар харагдах ёстой»); сонгосон бүлгийнх тод. Карт дайрахгүй замаар (зай · дээд зурвас).
   */
  const drawn = lines;
  /**
   * Багана АЛГАСАХ зураасны тоо — тэдгээр нь картуудын дээрх ТУСГАЙ ЗУРВАСААР (band) хөндлөн дамжина; зурвасны өндөр
   * нь тэдний тоогоор (2026-11-23: «зураас нэрийн картыг дарсан хэвээр»).
   */
  const skipN = useMemo(() => {
    const colOf = new Map(shown.map((p, i) => [p, i] as const));
    return drawn.filter((l) => {
      const a = g.nodes.get(l.a);
      const b = g.nodes.get(l.b);
      return !!a && !!b && Math.abs((colOf.get(a.p) ?? 0) - (colOf.get(b.p) ?? 0)) > 1;
    }).length;
  }, [g, shown, drawn]);

  /*
   * Холбооны зураас (сумгүй — чиглэлгүй) — хайрцгуудын БОДИТ байрлалаас (DOM): баруун багана руу бол баруун ирмэг → зүүн
   * ирмэг, зүүн тийш бол эсрэгээр, нэг баганад бол баруун талаар тойрно. Нэмэх — ногоон тасархай, устгах — улаан тасархай.
   */
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [paths, setPaths] = useState<{ key: string; d: string; cls: string; a: NodeId; b: NodeId; kind: Line['kind'] }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return undefined;
    const colOf = new Map(shown.map((p, i) => [p, i] as const));
    const draw = () => {
      const base = inner.getBoundingClientRect();
      const pos = new Map<string, DOMRect>();
      for (const el of inner.querySelectorAll<HTMLElement>('[data-id]')) pos.set(el.dataset.id!, el.getBoundingClientRect());
      /* Зурвасны дээд ирмэг — баганын толгойн доорх хоосон зай (`data-band`) */
      const bandEl = inner.querySelector<HTMLElement>('[data-band]');
      const bandTop = bandEl ? bandEl.getBoundingClientRect().top - base.top : 0;
      let k = 0;
      const out: { key: string; d: string; cls: string; a: NodeId; b: NodeId; kind: Line['kind'] }[] = [];
      for (const l of drawn) {
        const ra = pos.get(l.a);
        const rb = pos.get(l.b);
        const na = g.nodes.get(l.a);
        const nb = g.nodes.get(l.b);
        if (!ra || !rb || !na || !nb) continue;
        /* Зүүн талынхаас баруун тийш зурна */
        const [p1, n1, p2, n2] = (colOf.get(na.p) ?? 0) <= (colOf.get(nb.p) ?? 0) ? [ra, na, rb, nb] : [rb, nb, ra, na];
        const y1 = p1.top + p1.height / 2 - base.top;
        const y2 = p2.top + p2.height / 2 - base.top;
        let d: string;
        const c1 = colOf.get(n1.p) ?? 0;
        const c2 = colOf.get(n2.p) ?? 0;
        if (c2 - c1 > 1) {
          /*
           * Багана алгасна — картуудын дундуур БИШ: эх баганын баруун зайгаар дээш зурвас руу, зурвасаар хөндлөн, зорилтот
           * баганын зүүн зайгаар доош. Зураас бүр өөр эгнээ (зай · зурвас дотор) — давхцахгүй.
           */
          const off = 12 + (k % 8) * 6;
          const x1 = p1.right - base.left;
          const x2 = p2.left - base.left;
          const gx1 = x1 + off;
          const gx2 = x2 - off;
          /* Зурвасны эгнээ — 30-аас олон бол давтагдана (зурвас хэт өндөр болохгүй) */
          const yb = bandTop + 6 + (k % 30) * 5;
          k += 1;
          d = `M ${x1} ${y1} H ${gx1} V ${yb} H ${gx2} V ${y2} H ${x2}`;
        } else if (c1 < c2) {
          const x1 = p1.right - base.left;
          const x2 = p2.left - base.left;
          const c = Math.max(24, (x2 - x1) / 2);
          d = `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
        } else {
          const x1 = p1.right - base.left;
          const x2 = p2.right - base.left;
          const bulge = 28 + Math.min(40, Math.abs(y2 - y1) * 0.08);
          d = `M ${x1} ${y1} C ${x1 + bulge} ${y1}, ${x2 + bulge} ${y2}, ${x2} ${y2}`;
        }
        const on = sel === l.a || sel === l.b;
        out.push({ key: l.key, d, a: l.a, b: l.b, kind: l.kind, cls: l.kind === 'add' ? s.lAdd : l.kind === 'del' ? s.lDel : on ? s.lArrowOn : s.lArrow });
      }
      setPaths(out);
      setSize({ w: inner.scrollWidth, h: inner.scrollHeight });
    };
    let raf = requestAnimationFrame(draw);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
    ro?.observe(inner);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [g, shown, cols, sel, drawn]);

  if (!shown.length) return <p className={s.note}>{tr('Багц нэмж бүлгүүдийг харна уу.')}</p>;

  return (
    <div className={s.lanes} data-mode={editing ? 'edit' : undefined}>
      <div className={s.lanesIn} ref={innerRef} style={{ ['--band' as string]: `${skipN ? 10 + Math.min(skipN, 30) * 5 : 0}px` }}>
        <svg className={s.lArrows} width={size.w} height={size.h} aria-hidden>
          {paths.map((a) => <path key={a.key} d={a.d} className={a.cls} />)}
          {/* Засах горимд дарах талбай (өргөн, үл үзэгдэх) — зураас дээр дарж салгана/буцаана */}
          {editing && !busy && paths.map((a) => (
            <path key={`hit:${a.key}`} d={a.d} className={s.lHit} onClick={() => onLine(a.a, a.b)}>
              <title>{a.kind === 'del' ? tr('Буцаах') : tr('Салгах')}</title>
            </path>
          ))}
        </svg>
        {cols.map((c) => (
          <section key={c.p} className={s.lane} aria-label={pkgLabel(c.p)} data-p={c.p}>
            <h3 className={s.laneHead}>{pkgLabel(c.p)}</h3>
            <span className={s.laneBand} data-band aria-hidden />
            {!c.items.length && <p className={s.note}>{tr('Бүлэг олдсонгүй')}</p>}
            {c.items.map((it) => (it.kind === 'sec' ? (
              <p key={it.id} className={s.laneSec} title={it.label}>{it.label}</p>
            ) : (
              <button key={it.n.id} id={`ham-${it.n.id}`} data-id={it.n.id} type="button" disabled={busy}
                className={`${s.nodeBox} ${sel === it.n.id ? s.nodeSel : ''} ${linked.has(it.n.id) ? s.nodeLinked : ''} ${sel && sel !== it.n.id && !linked.has(it.n.id) ? s.nodeDim : ''}`}
                aria-pressed={sel === it.n.id} title={`${pkgLabel(it.n.p)} · ${nodeLabel(it.n)}`}
                onClick={() => onPick(it.n.id)}>
                <span className={s.nodeName}>{shortLabel(it.n)}</span>
                {(counts.get(it.n.id) ?? 0) > 0 && <b className={s.nodeCount}>↔{num(counts.get(it.n.id)!)}</b>}
              </button>
            )))}
          </section>
        ))}
      </div>
    </div>
  );
}

/* ══════════════ Сонгосон бүлэг — холбоотой бүлгүүд ══════════════ */

function SelPanel({ g, n, editing, busy, lines, orphans, onToggle, onToggleOrphan, onFocus, onClose }: {
  g: WorkGraph; n: WNode; editing: boolean; busy: boolean; lines: Line[]; orphans: Orphan[];
  onToggle: (other: WNode) => void;
  onToggleOrphan: (o: Orphan) => void;
  onFocus: (id: NodeId) => void;
  onClose: () => void;
}) {
  /* Нэг хос нэг мөр (хоёр талд хадгалагдсан ч) */
  const mine = new Map<NodeId, Line['kind']>();
  for (const l of lines) {
    if (l.a !== n.id && l.b !== n.id) continue;
    const o = l.a === n.id ? l.b : l.a;
    const cur = mine.get(o);
    if (!cur || cur === 'del') mine.set(o, l.kind);
  }
  const list = [...mine].map(([id, kind]) => ({ other: g.nodes.get(id), kind })).filter((x): x is { other: WNode; kind: Line['kind'] } => !!x.other);

  return (
    <aside className={s.selPanel} aria-label={tr('Сонгосон бүлэг')}>
      <header className={s.selHead}>
        <div>
          <p className={s.eyebrow}>{pkgLabel(n.p)}</p>
          <h3 className={s.selTitle}>{nodeLabel(n)}</h3>
        </div>
        <button type="button" className={s.chipX} aria-label={tr('Хаах')} onClick={onClose}>✕</button>
      </header>

      <h4 className={s.subTitle}>{tr('Холбоотой бүлгүүд')} <small className={s.mute}>({num(list.filter((x) => x.kind !== 'del').length)})</small></h4>
      {list.length === 0 && orphans.length === 0 ? <p className={s.note}>{editing ? tr('Холбох бүлгийг багана дээрээс дарна уу.') : '—'}</p> : (
        <ul className={s.linkList}>
          {list.map(({ other, kind }) => (
            <li key={other.id} className={kind === 'add' ? s.isAdd : kind === 'del' ? s.isDel : undefined}>
              <button type="button" className={s.chipLink} onClick={() => onFocus(other.id)}><b>{pkgLabel(other.p)}</b> {shortLabel(other)}</button>
              {kind !== 'saved' && <small className={s.mute}>{kind === 'add' ? tr('нэмэх') : tr('устгах')}</small>}
              {editing && (
                <button type="button" className={kind === 'saved' ? s.cutBtn : s.backBtn} disabled={busy} onClick={() => onToggle(other)}>
                  {kind === 'saved' ? tr('Салгах') : tr('Буцаах')}
                </button>
              )}
            </li>
          ))}
          {orphans.map((o) => (
            <li key={o.key} className={o.del ? s.isDel : s.bad}>
              <span>{pkgLabel(o.e.ref.p)} · {o.e.ref.k} <small>({whyText(o.e)})</small></span>
              {editing && (
                <button type="button" className={o.del ? s.backBtn : s.cutBtn} disabled={busy} onClick={() => onToggleOrphan(o)}>
                  {o.del ? tr('Буцаах') : tr('Салгах')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

