'use client';

/**
 * ХУВААРЬ — «Гүйцэтгэл бөглөх» хуудасны эхлэх/дуусах огноог ТӨЛӨВЛӨХ хэсэг.
 *
 * ⚠️ ЯАГААД ТУСДАА ХАРАГДАЦ (2026-08-28, хэрэглэгчийн шийдвэр): бөглөх хуудас
 * нь 1,400 мөр × 60 багана. Тэнд нэг ажлыг 12–22 блокт хуваарилахын тулд
 * 24–44 удаа календар нээж дарна. Амьд өгөгдөл үүнийг баталсан — 10 багцын
 * 6-д хуваарийн хамралт 6%-иас доогуур:
 *
 *     Багц 3.3    11/1173   0.9%      Багц 2·12F  1348/1557  86.6%
 *     Багц 4-1    22/1385   1.6%      Багц 3.2    1165/1374  84.8%
 *
 * ⚠️ ГОЛ САНАА: хуваарийг НҮДЭЭР биш, ГУРВАН ТООГООР — эхлэх огноо,
 * үргэлжлэх хоног, блок хооронд хэдэн хоног. Систем блок бүрийн 2 огноог
 * өөрөө бичнэ. Барилгын салбарт давтагдах блоктой төсөлд үүнийг «takt /
 * location-based planning» гэдэг.
 *
 * ⚠️ ХАРИЛЦАН ҮЙЛДЭЛ 2026-08-28-нд ДАХИН ЗОХИОМЖЛОГДСОН. Эхний хувилбарт
 * мөрийг зүүн талд дарж, засварлагч нь БАРУУН талын тусдаа самбарт нээгддэг
 * байсан бөгөөд утга оруулаад «Хуваарь үүсгэх» → дараа нь «Хадгалах» гэж
 * ХОЁР өөр газарт дарах шаардлагатай байв. Хэрэглэгч «edit хийх процесс нь
 * хэт ойлгомжгүй» гэж мэдэгдсэн. Гурван зүйлийг өөрчлөв:
 *
 *   1. ЗАСВАРЛАГЧ МӨРИЙН ДООР нээгдэнэ — дарсан газраа хариу гарна, нүд
 *      дэлгэцийн нөгөө тал руу үсрэхгүй.
 *   2. «Хуваарь үүсгэх» товч ХАСАГДСАН — оруулсан утга ШУУД ноорог болно.
 *      Урьдчилан харах ба ноорог хоёр нь НЭГ зүйлийн хоёр нэр байсан;
 *      хооронд нь товч тавих нь алхам нэмээд, дарахаа мартвал ажил алдагдана.
 *   3. ХАЙЛТ нэмэгдсэн — 1,266 мөрөөс нэг ажлыг гүйлгэж олох нь өөрөө саад.
 *
 * ⚠️ ХАДГАЛАЛТ нь БАЙГАА хуудсанд буцаж бичигдэнэ (`applyUpdates`) — шинэ
 * үйлчилгээ үүсгэхгүй тул төлөвлөгөөт хувь, график, тайлан бүгд өөрчлөлтгүй.
 * АРХИВТ ШИНЭ АГШИН ҮҮСГЭХГҮЙ: хуваарь нь хэмжилт биш, төлөвлөгөө.
 */

import {
  type PointerEvent as PEvt, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { t as tr } from '@/lib/i18nCore';
import { Section, Empty, Loading } from '@/components/ui';
import { useAuth } from '@/components/AuthGate';
import { hasCap, subscribeCaps } from '@/lib/caps';
import { num } from '@/lib/format';
import {
  loadSchema, pkgFloors, PKG_GROUPS, PKGS, type Pkg, type Schema,
} from '@/modules/sheet/bagts.pkg';
import { applyUpdates, loadRows, msToDay, type SheetRow } from '@/modules/sheet/bagtsSheet';
import {
  DAY, coverageOf, endOf, rhythmOf, spanDays, spread, statusOf, validate,
  type Issue, type PlanRow, type Span, type Status,
} from '@/lib/plan';
import h from './huvaari.module.css';

/* ══════════════════ Туслах ══════════════════ */

/** Богино огноо — «03-02». Жил нь хүрээний шошгонд бий. */
const short = (ms: number) => msToDay(ms).slice(5);

const ISSUE_TEXT: Record<Issue['kind'], (d: string) => string> = {
  reversed: (d) => tr('Дуусах огноо эхлэхээсээ ӨМНӨ ({0})', d),
  tooLong: (d) => tr('Хэт урт — {0} хоног', d),
  partial: (d) => tr('Зөвхөн {0} блокт хуваарьтай', d),
  outsideParent: (d) => tr('Бүлгийн мужаас ({0}) хальсан', d),
  late: (d) => tr('Хуваарь дууссан ч гүйцэтгэл 0 — {0} блок', d),
};

/** `SheetRow[]` → `PlanRow[]`. `i` нь ЭХ массивын индекс. */
function toPlanRows(rows: SheetRow[], n: number): PlanRow[] {
  return rows.map((r, i) => ({
    i,
    oid: r.oid,
    no: r.no,
    work: r.work,
    depth: r.depth,
    group: r.group,
    spans: Array.from({ length: n }, (_, b) => (
      r.start[b] != null && r.end[b] != null
        ? { start: r.start[b] as number, end: r.end[b] as number }
        : null
    )),
    act: r.act,
  }));
}

/** Нийтлээгүй засвар: `oid` → блок бүрийн шинэ хуваарь */
type Draft = Map<number, (Span | null)[]>;

/* ══════════════════ Үндсэн харагдац ══════════════════ */

export function Huvaari() {
  const { user, status } = useAuth();
  const [capN, setCapN] = useState(0);
  useEffect(() => subscribeCaps(() => setCapN((x) => x + 1)), []);
  /**
   * ЗАСАХ ЭРХ — тусад нь олгодог (`caps`).
   * ⚠️ Нэг огноо солиход БҮХ багцын төлөвлөгөөт хувь, тайлан, хоцрогдлын
   *    дохио дахин бодогдоно. Бөглөх эрхэд дагалдуулж болохгүй: бөглөгч
   *    өөрийн хоцрогдлыг арилгахын тулд хуваарийг хойш чирэх боломжтой болно.
   */
  const canEdit = useMemo(
    () => status === 'off' || hasCap(user?.username, 'plan'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, status, capN],
  );

  const [pkg, setPkg] = useState<Pkg>(PKGS[0]);
  const [sc, setSc] = useState<Schema | null>(null);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const [draft, setDraft] = useState<Draft>(new Map());
  const [sel, setSel] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'none' | 'issue'>('all');
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  /**
   * ХУАНЛИД ЯМАР БҮЛГИЙН ДОТОР байна вэ.
   *
   * ⚠️ ЭНД БАЙХ ШАЛТГААН (2026-08-28, хэрэглэгч): «эндээс зөвхөн бүлгээ сонгож,
   *    доод хэсэгт төлөвлөлтөө хийнэ» — жагсаалт нь СОНГОХ, хуанли нь ЗАСАХ
   *    хэрэгсэл. Хоёулаа нэг төлөв хуваалцах ёстой тул эцэгт байрлана.
   */
  const [scope, setScope] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setBusy(true); setErr(''); setRows([]); setSc(null);
    setDraft(new Map()); setSel(null); setCollapsed(new Set()); setQ(''); setScope(null);
    loadSchema(pkg)
      .then(async (schema) => {
        const r = await loadRows(pkg, schema);
        if (!alive) return;
        setSc(schema);
        setRows(r.rows);
      })
      .catch((e) => alive && setErr(String((e as Error).message || e)))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [pkg]);

  const n = sc?.bld.length ?? 0;

  /**
   * ⚠️ ХОЁР ШАТ, НЭГ БИШ. Чирэх бүрд ноорог солигдоно; нэг `useMemo` байвал
   * 1,266 мөр × 12 блок бүхий `PlanRow` массивыг чирэлтийн КАДР БҮРД дахин
   * үүсгэнэ (≈15,000 объект). Суурь нь зөвхөн ТАТСАН өгөгдлөөс хамаарна тул
   * тусад нь санана — чирэхэд зөвхөн нимгэн `map` ажиллана.
   */
  const base = useMemo(() => toPlanRows(rows, n), [rows, n]);
  const plan = useMemo(
    () => (draft.size
      ? base.map((r) => (draft.has(r.oid) ? { ...r, spans: draft.get(r.oid)! } : r))
      : base),
    [base, draft],
  );

  const now = useMemo(() => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }, []);
  const issues = useMemo(() => validate(plan, now), [plan, now]);
  const cov = useMemo(() => coverageOf(plan), [plan]);

  const issueBy = useMemo(() => {
    const m = new Map<number, Issue[]>();
    for (const x of issues) {
      const a = m.get(x.row);
      if (a) a.push(x); else m.set(x.row, [x]);
    }
    return m;
  }, [issues]);

  /**
   * ХАРАГДАХ МӨРҮҮД — эвхэлт · шүүлт · ХАЙЛТ.
   *
   * ⚠️ ХАЙЛТ нь эвхэлтийг ҮЛ ХЭРЭГСЭНЭ: хайж байгаа хүн модны бүтцийг биш,
   *    ажлаа хайж байна. Эвхэгдсэн бүлгийн дотор нуугдвал «олдохгүй» гэж
   *    дүгнэнэ. Хайлтын үед бүлгийн мөрүүд ч ХАСАГДАНА — тэдгээр нь
   *    засагддаггүй тул үр дүнг л шуугиулна.
   */
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle) {
      return plan.filter((r) => !r.group
        && (r.work.toLowerCase().includes(needle) || r.no.toLowerCase().includes(needle))
        && (filter !== 'none' || !r.spans.some(Boolean))
        && (filter !== 'issue' || issueBy.has(r.i)));
    }
    const out: PlanRow[] = [];
    let hideBelow = -1;
    for (const r of plan) {
      if (hideBelow >= 0 && r.depth > hideBelow) continue;
      hideBelow = -1;
      if (r.group && collapsed.has(r.oid)) hideBelow = r.depth;
      if (!r.group && filter === 'none' && r.spans.some(Boolean)) continue;
      if (!r.group && filter === 'issue' && !issueBy.has(r.i)) continue;
      out.push(r);
    }
    return out;
  }, [plan, collapsed, filter, issueBy, q]);

  /**
   * Жагсаалтын мөр дарахад хуанлийг ТЭР бүлэг рүү аваачна.
   * ⚠️ Ажлын мөр дарвал өөрийг нь биш ЭЦГИЙГ нь нээнэ — ажил нь бүлгийн
   *    доторх мөр учир эцгийг нь нээж байж л түүнийг хуанлиас олж харна.
   */
  const focus = useCallback((r: PlanRow) => {
    setSel(r.i);
    if (r.group) { setScope(r.i); return; }
    const at = plan.findIndex((x) => x.i === r.i);
    for (let k = at - 1; k >= 0; k--) {
      if (plan[k].depth < r.depth && plan[k].group) { setScope(plan[k].i); return; }
    }
    setScope(null);
  }, [plan]);

  const setSpans = useCallback((oid: number, spans: (Span | null)[]) => {
    setDraft((d) => {
      const m = new Map(d);
      m.set(oid, spans);
      return m;
    });
  }, []);
  /** Олон ажлыг НЭГ үйлдлээр — бүлгийн мужид хуваарилахад */
  const setMany = useCallback((list: { oid: number; spans: (Span | null)[] }[]) => {
    setDraft((d) => {
      const m = new Map(d);
      for (const x of list) m.set(x.oid, x.spans);
      return m;
    });
  }, []);
  const save = useCallback(async () => {
    if (!sc || !draft.size || busy) return;
    setBusy(true); setErr(''); setNote('');
    try {
      const byOid = new Map(rows.map((r) => [r.oid, r]));
      const upd: Record<string, unknown>[] = [];
      for (const [oid, spans] of draft) {
        const orig = byOid.get(oid);
        if (!orig) continue;
        const a: Record<string, unknown> = { [sc.f.oid]: oid };
        let changed = 0;
        spans.forEach((s, b) => {
          /* ⚠️ Талбар байхгүй блок бий (эх хуудасны толгой эвдэрсэн) — тэнд
             бичих газаргүй тул АЛГАСНА, унахгүй. */
          if (!sc.start[b] && !sc.end[b]) return;
          const ns = s ? s.start : null;
          const ne = s ? s.end : null;
          /**
           * ⚠️ ЗӨВХӨН ӨӨРЧЛӨГДСӨН БЛОКИЙГ бичнэ.
           *
           * Урьд нь ноорогтой мөрийн БҮХ блокийг бичдэг байв. `toPlanRows`-д
           * муж нь эхлэх БА дуусах хоёулаа байж л үүсдэг тул ЗӨВХӨН эхлэх
           * огноотой (эсвэл зөвхөн дуусахтай) хагас бөглөсөн блок нь `null`
           * муж болж, хадгалахад тэр огноо ЧИМЭЭГҮЙ УСТДАГ байлаа — өөр
           * блокт нэг зурвас чирсний төлөө. Ялгааг харьцуулж бичих нь
           * үүнийг таслаад зогсохгүй сүлжээнд явах талбарыг ч цөөрүүлнэ.
           */
          if (ns === orig.start[b] && ne === orig.end[b]) return;
          if (sc.start[b]) a[sc.start[b]] = ns;
          if (sc.end[b]) a[sc.end[b]] = ne;
          changed += 1;
        });
        if (changed) upd.push(a);
      }
      if (!upd.length) {
        setDraft(new Map());
        setNote(tr('Өөрчлөлт олдсонгүй — хуваарь хэвээрээ.'));
        return;
      }
      await applyUpdates(pkg, upd);
      const r = await loadRows(pkg, sc);
      setRows(r.rows);
      setDraft(new Map());
      setNote(tr('{0} ажлын хуваарь хадгалагдлаа', num(upd.length)));
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  }, [sc, draft, busy, pkg, rows]);

  /**
   * ⚠️ ХАДГАЛААГҮЙ НООРОГ нь зөвхөн санах ойд байна. Таб хаах, дахин ачаалах,
   * багц солих гурвуулаа түүнийг чимээгүй устгана. Багц солихыг доор мэдэгдэнэ;
   * браузерын түвшний хаалтыг энд барина.
   */
  useEffect(() => {
    if (!draft.size) return undefined;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft.size]);

  /**
   * ⚠️ БАГЦ СОЛИХ нь ноорогийг ЧИМЭЭГҮЙ устгана (доорх `useEffect` бүх
   * төлөвийг цэвэрлэдэг). Хуанли дээр хагас цагийн ажил хийчихээд багцаа
   * буруу дарахад бүхэлдээ алдагдах нь эргэж сэргээх аргагүй.
   */
  const askSwitch = useCallback(
    () => draft.size === 0
      || window.confirm(tr('Хадгалаагүй {0} өөрчлөлт байна. Хаяад солих уу?', num(draft.size))),
    [draft.size],
  );

  const floors = pkgFloors(pkg.group);

  return (
    <div className={h.frame}>
      <header className={h.head}>
        <label className={h.field}>
          {tr('Багц')}{' '}
          <select className={h.select} value={pkg.group} disabled={busy}
            onChange={(e) => { if (askSwitch()) setPkg(pkgFloors(e.target.value)[0]); }}>
            {PKG_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        {floors.length > 1 && (
          <label className={h.field}>
            {tr('Хувилбар')}{' '}
            <select className={h.select} value={pkg.key} disabled={busy}
              onChange={(e) => {
                if (askSwitch()) setPkg(PKGS.find((x) => x.key === e.target.value) ?? pkg);
              }}>
              {floors.map((p) => <option key={p.key} value={p.key}>{p.floors}F</option>)}
            </select>
          </label>
        )}
        <span className={h.spacer} />
        <Coverage cov={cov} n={n} />
        {canEdit && draft.size > 0 && (
          /* ⚠️ БУЦААХ ЗАМ. Хуанли дээр чирэх нь маш хурдан үйлдэл тул санамсаргүй
             өөрчлөлт гарна — хадгалахаас өмнө бүгдийг нэг товчоор цуцлах
             боломжгүй бол хэрэглэгч хуудсаа дахин ачаалахаас өөр аргагүй. */
          <button type="button" className={h.discard} disabled={busy}
            title={tr('Хадгалаагүй бүх өөрчлөлтийг хаяна')}
            onClick={() => { setDraft(new Map()); setNote(''); }}>
            {tr('Цуцлах')} ({num(draft.size)})
          </button>
        )}
        {canEdit && (
          <button type="button" className={h.save} disabled={busy || draft.size === 0} onClick={save}>
            {tr('Хадгалах')}{draft.size ? ` (${draft.size})` : ''}
          </button>
        )}
      </header>

      {/*
        * ⚠️ ХОЁР АЛХАМ, ДӨРӨВ БИШ. Урьд нь «мөр сонго → утга оруул → ҮҮСГЭХ →
        * ХАДГАЛ» байсныг гурав дахийг нь хасаж хоёр болгов: оруулсан утга
        * шууд ноорог болно.
        */}
      <ol className={h.steps}>
        <li><b>1</b> {tr('Энэ жагсаалтаас бүлгээ сонгоно — доод хуанли тэр бүлэг рүү шилжинэ')}</li>
        <li><b>2</b> {tr('Доод хуанли дээр мужаа чирж татаад дотор нь ажлуудаа тавина — дараа нь «Хадгалах»')}</li>
      </ol>

      {err && <p className={h.err}>{err}</p>}
      {note && <p className={h.note} onClick={() => setNote('')}>{note}</p>}
      {!canEdit && (
        <p className={h.note}>
          {tr('Танд хуваарь засах эрх алга — зөвхөн харна. Эрхийг админ «Хуваарь төлөвлөх» гэж тусад нь олгоно.')}
        </p>
      )}

      {busy && !rows.length ? (
        <Loading label={tr('Хуваарь ачаалж байна…')} />
      ) : !sc || !rows.length ? (
        <Empty label={tr('Энэ багцад мөр олдсонгүй.')} />
      ) : (
        <div className={h.body}>
          <div className={h.list}>
            <div className={h.tabs}>
              {/* ХАЙЛТ — 1,266 мөрөөс гүйлгэж олох нь өөрөө саад */}
              <input
                className={h.search}
                placeholder={tr('Ажлын нэрээр хайх…')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {([
                ['all', tr('Бүгд'), plan.filter((r) => !r.group).length],
                ['none', tr('Хуваарьгүй'), cov.tasks - cov.planned],
                ['issue', tr('Асуудалтай'), issueBy.size],
              ] as const).map(([k, label, cnt]) => (
                <button key={k} type="button"
                  className={`${h.tab} ${filter === k ? h.tabOn : ''}`}
                  onClick={() => setFilter(k)}>
                  {label} <b>{num(cnt)}</b>
                </button>
              ))}
            </div>

            <div className={h.rows}>
              {visible.length === 0 && (
                <Empty label={q ? tr('«{0}» гэсэн ажил олдсонгүй.', q) : tr('Мөр алга.')} />
              )}
              {visible.map((r) => (
                <div key={r.oid}>
                  <TaskRow
                    r={r} n={n}
                    on={sel === r.i}
                    dirty={draft.has(r.oid)}
                    issues={issueBy.get(r.i)}
                    collapsed={collapsed.has(r.oid)}
                    onToggle={() => setCollapsed((s) => {
                      const m = new Set(s);
                      if (m.has(r.oid)) m.delete(r.oid); else m.add(r.oid);
                      return m;
                    })}
                    onPick={() => focus(r)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={h.side}>
            <IssueList
              issues={issues}
              rows={plan}
              onPick={(i) => {
                setQ('');
                /* ⚠️ Зөвхөн `setSel` хангалтгүй: хуанли өөр бүлгийн дотор
                   байвал сонгосон мөр нь ХАРАГДАХГҮЙ тул «юу ч болсонгүй»
                   мэт мэдрэгдэнэ. `focus` нь эцгийг нь ч нээнэ. */
                const r = plan.find((x) => x.i === i);
                if (r) focus(r);
              }}
            />
          </div>

          <div className={h.flow}>
            <Planner
              rows={plan}
              blocks={sc.bld}
              sel={sel}
              scope={scope}
              onScope={setScope}
              now={now}
              canEdit={canEdit}
              draft={draft}
              onPick={setSel}
              onSet={setSpans}
              onSetMany={setMany}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════ Хамралт ══════════════════ */

function Coverage({ cov, n }: { cov: ReturnType<typeof coverageOf>; n: number }) {
  const pctTasks = cov.tasks ? (cov.planned / cov.tasks) * 100 : 0;
  /**
   * ⚠️ ХОЁР ХУВЬ ЯЛГААТАЙ: «ажлын хамралт» нь ядаж нэг блокт төлөвлөгдсөн
   * ажил, «нүдний хамралт» нь ажил × блок бүрэн бөглөгдсөн эсэх. Эхнийх нь
   * үргэлж өндөр — хоёуланг үзүүлэхгүй бол бодит байдал далдлагдана.
   */
  const pctCells = cov.cells ? (cov.filled / cov.cells) * 100 : 0;
  const tone = pctTasks >= 80 ? 'var(--good-ink)' : pctTasks >= 40 ? 'var(--warn)' : 'var(--bad-ink)';
  return (
    <div className={h.cov}>
      <span className={h.covLabel}>{tr('Хуваарийн хамралт')}</span>
      <b className="num" style={{ color: tone }}>{pctTasks.toFixed(0)}%</b>
      <span className={h.covSub}>
        {num(cov.planned)}/{num(cov.tasks)} {tr('ажил')} · {pctCells.toFixed(0)}% {tr('нүд')}
        {cov.planned > 0 && <> · {num(cov.patterns)} {tr('өөр хуваарь')}</>}
      </span>
      <span className={h.covSub}>{num(n)} {tr('блок')}</span>
    </div>
  );
}

/* ══════════════════ Ажлын мөр ══════════════════ */

function TaskRow({
  r, n, on, dirty, issues, collapsed, onToggle, onPick,
}: {
  r: PlanRow; n: number; on: boolean; dirty: boolean;
  issues?: Issue[]; collapsed: boolean;
  onToggle: () => void; onPick: () => void;
}) {
  const rh = rhythmOf(r.spans);
  const filled = r.spans.filter(Boolean).length;
  const bad = issues?.some((x) => x.level === 'error');

  return (
    <div
      className={`${h.row} ${on ? h.rowOn : ''} ${r.group ? h.rowGroup : ''} ${dirty ? h.rowDirty : ''}`}
      style={{ paddingLeft: `${r.depth * 12 + 8}px` }}
    >
      {r.group ? (
        <button type="button" className={h.caret} onClick={onToggle}
          aria-label={collapsed ? tr('Дэлгэх') : tr('Эвхэх')}>
          {collapsed ? '▸' : '▾'}
        </button>
      ) : <span className={h.caretGap} />}

      <button type="button" className={h.rowMain} onClick={onPick} title={r.work}>
        <span className={h.rowNo}>{r.no}</span>
        <span className={h.rowWork}>{r.work}</span>
      </button>

      <span className={h.rowPlan}>
        {rh.kind === 'none' ? (
          <span className={h.rowNone}>{tr('хуваарьгүй')}</span>
        ) : rh.kind === 'even' ? (
          <>
            <b className="num">{short(rh.first)}</b>
            <span className={h.rowDim}>{rh.days}{tr('х')}</span>
            {rh.blocks > 1 && <span className={h.rowDim}>+{rh.takt}</span>}
          </>
        ) : (
          <>
            <b className="num">{short(rh.first)}</b>
            <span className={h.rowIrr}>{rh.why === 'takt' ? tr('алхам жигд бус') : tr('хугацаа жигд бус')}</span>
          </>
        )}
      </span>

      <span className={`${h.rowBlocks} num`}>{filled}/{n}</span>

      {issues?.length ? (
        <span className={`${h.flag} ${bad ? h.flagBad : h.flagWarn}`}
          title={issues.map((x) => ISSUE_TEXT[x.kind](x.detail)).join('\n')}>
          {issues.length}
        </span>
      ) : <span className={h.flagGap} />}
    </div>
  );
}

/* ══════════════════ Асуудлын жагсаалт ══════════════════ */

function IssueList({
  issues, rows, onPick,
}: { issues: Issue[]; rows: PlanRow[]; onPick: (i: number) => void }) {
  const byRow = rows.reduce((m, r) => m.set(r.i, r), new Map<number, PlanRow>());
  const errs = issues.filter((x) => x.level === 'error').length;
  return (
    <Section
      title={tr('Хуваарийн асуудал')}
      note={
        issues.length === 0
          ? <span style={{ color: 'var(--good-ink)' }}>{tr('алга')}</span>
          : <span style={{ color: errs ? 'var(--bad-ink)' : 'var(--warn)' }}>
            {errs ? tr('{0} алдаа · ', num(errs)) : ''}{num(issues.length - errs)} {tr('анхааруулга')}
          </span>
      }
    >
      {issues.length === 0 ? (
        <Empty label={tr('Хуваарийн алдаа олдсонгүй.')} />
      ) : (
        <div className={h.issues}>
          {/* ⚠️ Эхний 60 — бүгдийг зурвал багана хэдэн мянган мөр болно */}
          {issues.slice(0, 60).map((x, k) => (
            <button key={k} type="button" className={h.issue} onClick={() => onPick(x.row)}>
              <span className={x.level === 'error' ? h.iErr : h.iWarn}>●</span>
              <span className={h.issueWork}>{byRow.get(x.row)?.work ?? '—'}</span>
              <span className={h.issueText}>{ISSUE_TEXT[x.kind](x.detail)}</span>
            </button>
          ))}
          {issues.length > 60 && (
            <p className={h.issueMore}>{tr('… бас {0}', num(issues.length - 60))}</p>
          )}
        </div>
      )}
    </Section>
  );
}

/* ══════════════════ ТӨЛӨВЛӨХ ХУАНЛИ ══════════════════ */

/**
 * PLANNER — УРТ ХУАНЛИ дээр ШУУД чирж төлөвлөнө.
 *
 * ⚠️ ЯАГААД ХАРАХ БИШ ЗАСАХ ТАЛБАЙ (2026-08-28, хэрэглэгчийн заавар): доод
 * хэсэг нь ердөө «зураг» байсан — төлөвлөгөөг дээд талын талбаруудад тоогоор
 * оруулаад доор нь үр дүнг хардаг. Хүн хугацааг ТООГООР биш, УРТААР сэтгэдэг.
 * Одоо мөр бүр дээр ХУЛГАНААР чирж муж татна, чирч зөөнө, ирмэгээс нь татаж
 * уртасгана. Оруулах ба харах нь НЭГ газарт болов.
 *
 * ⚠️ ХАМГИЙН БАГА 365 ХОНОГ. Хэрэглэгчийн шаардлага: «даргаагийн жилийн
 * хоногууд орж ирдэг урт нэг мөрийн календар». Тиймээс хуанли нь агуулгаасаа
 * үл хамааран доод тал нь нэг жил, шаардлагатай бол ДАРААГИЙН ЖИЛ рүү үргэлжилнэ.
 *
 * ⚠️ МӨР БҮР = НЭГ АЖИЛ, тиймээс ЗЭРЭГ явах ажлууд зэрэгцээ мөрөнд харагдана
 * (Y тэнхлэгт блок биш АЖИЛ). Нэг бүлгийн доторх 12 ажил зэрэг эхлэх нь
 * барилгад хэвийн — тэдгээрийг нэг мөрөнд давхарлавал уншигдахгүй.
 *
 * ⚠️ БЛОК: хуваарь блок бүрд ТУСДАА хадгалагддаг. Хуанли нэг зэрэг НЭГ
 * блокийн хуваарийг заана (дээрх сонголт) — бусад блокт «алхмаар тараах»
 * товчоор хэмнэлтэйгээр хуулна.
 */

/** Хуанлийн мөрийн өндөр (px) */
const PL_ROW = 30;

/**
 * Хоног тутмын өргөн (px) — томруулалт бүрд.
 * ⚠️ 8px/хоног хэт нарийн байв: 1–2 хоногийн ажил 8–16px зурвас болж чирэх
 *    бариул нь зурвасаа бүтэн эзэлнэ. Хамгийн нарийн нь 12px — 2 хоногийн
 *    ажил ч 24px, бариул + гол хэсэг гэж хуваагдана.
 */
const ZOOM: Record<'day' | 'week' | 'month', number> = { day: 34, week: 12, month: 4 };
type Zoom = keyof typeof ZOOM;

/**
 * ⚠️ ӨНГӨ нь ТӨЛӨВЛӨГӨӨ биш ГҮЙЦЭТГЭЛийг илэрхийлнэ: дууссан ногоон, явж
 * буй цэнхэр, хоцорсон улаан, эхлээгүй саарал, хэмжигдээгүй нь ЦАЙВАР
 * ЗУРААСТАЙ — «мэдэхгүй»-г «тэг»-ээс ялгана.
 */
const ST_CLASS: Record<Status, string> = {
  done: h.tlDone, run: h.tlRun, todo: h.tlTodo, late: h.tlLate, none: h.tlNone,
};
const ST_TEXT: Record<Status, string> = {
  done: 'дууссан', run: 'явж байгаа', todo: 'эхлээгүй', late: 'хоцорсон', none: 'хэмжигдээгүй',
};

type DragMode = 'new' | 'move' | 'l' | 'r';
type Drag = { oid: number; mode: DragMode; anchor: number; orig: Span | null };

function Planner({
  rows, blocks, sel, scope, onScope, now, canEdit, draft, onPick, onSet, onSetMany,
}: {
  rows: PlanRow[];
  blocks: string[];
  sel: number | null;
  scope: number | null;
  onScope: (i: number | null) => void;
  now: number;
  canEdit: boolean;
  draft: Draft;
  onPick: (i: number) => void;
  onSet: (oid: number, spans: (Span | null)[]) => void;
  onSetMany: (list: { oid: number; spans: (Span | null)[] }[]) => void;
}) {
  const [zoom, setZoom] = useState<Zoom>('week');
  const [blk, setBlk] = useState(0);
  const [takt, setTakt] = useState(7);
  /**
   * БҮХ ДООД АЖЛЫГ дэлгэх эсэх.
   * ⚠️ Шууд хүүхэд нь модны бүтцээр цэгцтэй ч «зэрэг явах ажлуудыг зэрэг
   *    төлөвлөх»-д хангалтгүй — зэрэгцээ ажлууд өөр өөр дэд бүлэгт байрлаж
   *    магадгүй. Тэгш дэлгэвэл бүгд НЭГ дэлгэцэнд зэрэгцэнэ.
   */
  const [deep, setDeep] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  /**
   * Чирэлт хамгийн сүүлд ЯМАР ХОНОГ дээр байсан.
   * ⚠️ `pointermove` секундэд ~60 удаа ирнэ, харин хоног нь зөвхөн багана
   *    (12–34px) давахад л солигдоно. Хоног солигдоогүй бол ажил хийхгүй —
   *    эс тэгвээс 1,266 мөрийн шалгалт, хамралт кадр бүрд дахин бодогдоно.
   */
  const lastDay = useRef(-1);
  /** Товшилт vs чирэлт — доод талын тайлбарыг үзнэ үү */
  const moved = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const jumped = useRef(false);

  /* ── Харагдах мөрүүд: бүлэг + ШУУД хүүхдүүд ─────────────────────────
     ⚠️ Бүх удмыг зурвал нэг бүлэгт 200+ мөр гарч, «мужийг нь тэмдэглээд
        дотор нь ажлуудаа тавих» гэдэг санаа алдагдана. Хүүхэд бүлэг рүү
        дарж ГҮНЗГИЙРНЭ (breadcrumb-аар буцна). */
  const view = useMemo(() => {
    if (scope == null) {
      const top = rows.length ? Math.min(...rows.map((r) => r.depth)) : 0;
      return { head: null as PlanRow | null, kids: rows.filter((r) => r.depth === top) };
    }
    const at = rows.findIndex((r) => r.i === scope);
    if (at < 0) return { head: null as PlanRow | null, kids: [] as PlanRow[] };
    const g = rows[at];
    const kids: PlanRow[] = [];
    for (let k = at + 1; k < rows.length; k++) {
      if (rows[k].depth <= g.depth) break;
      if (deep ? !rows[k].group : rows[k].depth === g.depth + 1) kids.push(rows[k]);
    }
    return { head: g, kids };
  }, [rows, scope, deep]);

  /** Гүнзгийрсэн зам — дээш буцахад */
  const path = useMemo(() => {
    const out: PlanRow[] = [];
    let cur = scope;
    while (cur != null) {
      const at = rows.findIndex((r) => r.i === cur);
      if (at < 0) break;
      out.unshift(rows[at]);
      let up: number | null = null;
      for (let k = at - 1; k >= 0; k--) {
        if (rows[k].depth < rows[at].depth) { up = rows[k].group ? rows[k].i : null; break; }
      }
      cur = up;
    }
    return out;
  }, [rows, scope]);

  const lanes = useMemo(
    () => (view.head ? [view.head, ...view.kids] : view.kids),
    [view],
  );

  /** Блок бүрд хуваарьтай АЖЛЫН тоо — сонголтын жагсаалтад харуулна */
  const blockFill = useMemo(() => {
    const c = new Array<number>(blocks.length).fill(0);
    for (const r of rows) {
      if (r.group) continue;
      r.spans.forEach((sp, b) => { if (sp) c[b] += 1; });
    }
    return c;
  }, [rows, blocks.length]);

  /* ── ХУАНЛИЙН ХҮРЭЭ — доод тал нь 365 хоног ──────────────────────── */
  const range = useMemo(() => {
    const all: number[] = [];
    for (const r of rows) for (const sp of r.spans) if (sp) { all.push(sp.start, sp.end); }
    const lo = all.length ? Math.min(...all, now) : now;
    const hi = all.length ? Math.max(...all) : now;
    /* Сарын эхнээс эхлүүлнэ — сарын багана тэгш харагдана */
    const d = new Date(lo);
    const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    /* ⚠️ Хамгийн багадаа 365 хоног, шаардлагатай бол дараагийн жил рүү */
    const to = Math.max(hi, from + 364 * DAY);
    return { from, to };
  }, [rows, now]);

  const { from, to } = range;
  const px = ZOOM[zoom];
  const total = Math.round((to - from) / DAY) + 1;
  const W = Math.round(total * px);
  const xOf = useCallback((ms: number) => Math.round(((ms - from) / DAY) * px), [from, px]);
  const dayAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const k = Math.floor((clientX - el.getBoundingClientRect().left) / px);
    return Math.min(total - 1, Math.max(0, k));
  };
  const msAt = (k: number) => from + k * DAY;

  /* ⚠️ Эхэнд ӨНӨӨДӨР рүү гүйлгэнэ — 365 хоногийн эхэнд тултал 2025 оны
     1-р сар харагдаж, «хоосон хуанли» гэж уншигдана. */
  useEffect(() => {
    if (jumped.current || !scrollRef.current) return;
    jumped.current = true;
    scrollRef.current.scrollLeft = Math.max(0, xOf(now) - 120);
  }, [now, xOf]);

  /* ── Чирэлт ────────────────────────────────────────────────────────── */

  const rowOf = (oid: number) => lanes.find((r) => r.oid === oid) ?? null;

  /**
   * Мужийг мөрд бичнэ. Бүлэг муж өгсөн бол хүүхдийг ТҮҮН РҮҮ ХАВЧУУЛНА —
   * «бүлгийн цонхны дотор» гэсэн дүрмийг чирэлтийн үедээ шууд сахина.
   */
  const commit = useCallback((oid: number, span: Span | null) => {
    const r = rowOf(oid);
    if (!r) return;
    let sp = span;
    const par = view.head && view.head.oid !== oid ? view.head.spans[blk] : null;
    if (sp && par) {
      const st = Math.max(sp.start, par.start);
      const en = Math.min(sp.end, par.end);
      sp = st <= en ? { start: st, end: en } : { start: par.start, end: par.start };
    }
    const next = r.spans.slice();
    next[blk] = sp;
    onSet(oid, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, view, blk, onSet]);

  /**
   * ⚠️ ДАРАХАД ШУУД БИЧИХГҮЙ. Урьд нь `pointerdown` дээр 1 хоногийн муж
   * бичдэг байсан тул хуваарьтай мөрийн ХООСОН хэсэгт санамсаргүй товшиход
   * 137 хоногийн хуваарь чимээгүй устаж, 1 хоног болдог байв. Одоо:
   *   · зөвхөн ТОВШИХ  → мөрийг сонгоно, хуваарь ХӨДЛӨХГҮЙ,
   *   · ЧИРЭХ         → эхний хөдөлгөөнөөс эхлэн муж татагдана,
   *   · хуваарьГҮЙ мөрд товшвол 1 хоногийн муж үүснэ (`onUp`).
   */
  const onDown = (e: PEvt<HTMLElement>, r: PlanRow, mode: DragMode) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const k = dayAt(e.clientX);
    lastDay.current = k;
    moved.current = false;
    setDrag({ oid: r.oid, mode, anchor: k, orig: r.spans[blk] });
    onPick(r.i);
  };

  const onMove = (e: PEvt<HTMLElement>) => {
    if (!drag) return;
    const k = dayAt(e.clientX);
    if (k === lastDay.current && moved.current) return;
    lastDay.current = k;
    moved.current = true;
    const o = drag.orig;
    if (drag.mode === 'new') {
      const a = Math.min(drag.anchor, k);
      const b = Math.max(drag.anchor, k);
      commit(drag.oid, { start: msAt(a), end: msAt(b) });
    } else if (o) {
      const d = (k - drag.anchor) * DAY;
      if (drag.mode === 'move') commit(drag.oid, { start: o.start + d, end: o.end + d });
      else if (drag.mode === 'l') commit(drag.oid, { start: Math.min(o.start + d, o.end), end: o.end });
      else commit(drag.oid, { start: o.start, end: Math.max(o.end + d, o.start) });
    }
  };

  const onUp = () => {
    /* Хөдөлгөөнгүй товшилт: хоосон мөрд 1 хоногийн муж, эсрэг тохиолдолд
       зөвхөн сонголт (дээрх тайлбар). */
    if (drag && !moved.current && drag.mode === 'new' && !drag.orig) {
      commit(drag.oid, { start: msAt(drag.anchor), end: msAt(drag.anchor) });
    }
    setDrag(null);
    moved.current = false;
  };

  /**
   * ИДЭВХТЭЙ БЛОКИЙН хуваарийг БУСАД блокт хэмнэлтэйгээр хуулна.
   * ⚠️ Блок бүрийг гараар чирэх нь 22 дахин их ажил. Барилгын давтагдах
   *    блокт хуваарь нь ижил, зөвхөн ЭХЛЭХ нь алхмаар хойшилдог (takt).
   */
  const spreadBlocks = () => {
    const list: { oid: number; spans: (Span | null)[] }[] = [];
    /**
     * ⚠️ ЭНЭ БОЛ ХАМГИЙН СҮЙТГЭГЧ ҮЙЛДЭЛ. Харагдаж буй мөр бүрийн БҮХ блокийн
     * хуваарийг дарж бичнэ — 12 ажил × 22 блок = 264 нүд нэг товшилтоор.
     * Бусад блокт нь гараар оруулсан хуваарь байвал бүгд алга болно. Тиймээс
     * бусад товчноос ялгаатай нь баталгаа асууна.
     */
    const willTouch = lanes.filter((r) => r.spans[blk]).length;
    if (!willTouch) return;
    if (!window.confirm(tr(
      '{0} мөрийн БҮХ {1} блокийн хуваарь «{2}» блокоос хуулагдана. Тэнд байсан хуваарь дарагдана. Үргэлжлүүлэх үү?',
      num(willTouch), num(blocks.length), blocks[blk],
    ))) return;
    for (const r of lanes) {
      const base = r.spans[blk];
      if (!base) continue;
      const days = spanDays(base);
      const next = r.spans.slice();
      blocks.forEach((_, b) => {
        const shift = (b - blk) * takt * DAY;
        next[b] = { start: base.start + shift, end: endOf(base.start + shift, days) };
      });
      list.push({ oid: r.oid, spans: next });
    }
    if (list.length) onSetMany(list);
  };

  /**
   * БҮЛГИЙН МУЖИД ЖИГД ХУВААРИЛНА — дээрээс доош төлөвлөлтийн гол үйлдэл.
   * ⚠️ Зөвхөн ЭНЭ блокт. Бусад блокт «алхмаар тараах»-аар хуулна — тэгэхгүй
   *    бол нэг товч дарахад 22 блокийн хуваарь бүхэлдээ дарагдана.
   */
  const spreadKids = () => {
    const g = view.head;
    const par = g?.spans[blk];
    if (!g || !par || !view.kids.length) return;
    const cut = spread(par, view.kids.length);
    onSetMany(view.kids.map((r, k) => {
      const next = r.spans.slice();
      next[blk] = cut[k];
      return { oid: r.oid, spans: next };
    }));
  };

  /** Сонгосон мөрийн ЭНЭ блокийн хуваарийг арилгана */
  const clearSel = () => {
    const r = lanes.find((x) => x.i === sel);
    if (!r) return;
    const next = r.spans.slice();
    next[blk] = null;
    onSet(r.oid, next);
  };

  /* ── Хуваарийн шошго ────────────────────────────────────────────── */
  const ticks: { at: number; lab: string; big: boolean }[] = [];
  const months: { at: number; lab: string }[] = [];
  for (let k = 0; k < total; k++) {
    const ms = from + k * DAY;
    const d = new Date(ms);
    const isFirst = d.getUTCDate() === 1;
    if (isFirst) months.push({ at: ms, lab: msToDay(ms).slice(0, 7) });
    /* ⚠️ Ганц тоо («21», «28») нь ямар сарынх нь тодорхойгүй. Сарын нэр
       ДЭЭД мөрөнд тусдаа, хоногийн шошго нь «сар-өдөр» хэлбэрээр доор. */
    if (zoom === 'day') ticks.push({ at: ms, lab: String(d.getUTCDate()), big: isFirst });
    else if (zoom === 'week') {
      if (d.getUTCDay() === 1 || isFirst) {
        ticks.push({ at: ms, lab: msToDay(ms).slice(5), big: isFirst });
      }
    } else if (d.getUTCDay() === 1 || isFirst) ticks.push({ at: ms, lab: '', big: isFirst });
  }

  const dirtyN = lanes.filter((r) => draft.has(r.oid)).length;

  return (
    <Section
      fill
      title={tr('Төлөвлөх хуанли')}
      note={(
        <span className={h.flowNote}>
          {msToDay(from)} → {msToDay(to)} · {num(total)} {tr('хоног')}
          {dirtyN ? <> · <b className={h.dirtyTag}>{tr('хадгалаагүй')} {num(dirtyN)}</b></> : null}
        </span>
      )}
    >
      <div className={h.plTop}>
        {/* ГҮНЗГИЙРСЭН ЗАМ — «бүлэг сонгож дотор нь орох» */}
        <nav className={h.plPath}>
          <button type="button" className={h.plCrumb} onClick={() => onScope(null)}>
            {tr('Бүх бүлэг')}
          </button>
          {path.map((g) => (
            <span key={g.oid}>
              <span className={h.plSep}>›</span>
              <button type="button" className={h.plCrumb} onClick={() => onScope(g.i)}>
                {(g.work || g.no).slice(0, 28)}
              </button>
            </span>
          ))}
        </nav>

        <label className={h.plField}>
          {tr('Блок')}{' '}
          {/* ⚠️ Блокийн нэрний хажууд ХУВААРЬТАЙ мөрийн тоо. Үүнгүй бол аль
              блок дээр ажил хийгдсэн, аль нь хоосныг мэдэхийн тулд 22 блокийг
              нэг бүрчлэн сонгож үзэхээс өөр арга байхгүй. */}
          <select className={h.select} value={blk} onChange={(e) => setBlk(Number(e.target.value))}>
            {blocks.map((b, k) => (
              <option key={b} value={k}>{b} · {num(blockFill[k])}</option>
            ))}
          </select>
        </label>

        {view.head && (
          <button type="button"
            className={`${h.tlZoomB} ${deep ? h.tlZoomOn : ''}`}
            title={tr('Дэд бүлгүүдийг задалж, доторх БҮХ ажлыг зэрэгцүүлж харуулна')}
            onClick={() => setDeep((v) => !v)}>
            {tr('Бүх доод ажил')}
          </button>
        )}

        <div className={h.tlZoom}>
          {(['day', 'week', 'month'] as Zoom[]).map((z) => (
            <button key={z} type="button"
              className={`${h.tlZoomB} ${zoom === z ? h.tlZoomOn : ''}`}
              onClick={() => setZoom(z)}>
              {z === 'day' ? tr('хоног') : z === 'week' ? tr('7 хоног') : tr('сар')}
            </button>
          ))}
        </div>

        <button type="button" className={h.tlZoomB}
          onClick={() => { if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, xOf(now) - 120); }}>
          {tr('Өнөөдөр')}
        </button>

        {canEdit && (
          <>
            <label className={h.plField}>
              {tr('Алхам')}{' '}
              {/* ⚠️ 365-аар хязгаарлана: санамсаргүй нэмэлт тэг нь зурвасуудыг
                  хуанлиас хол гаргаж, буцааж олох аргагүй болгоно. */}
              <input type="number" min={0} max={365} className={h.numIn} value={takt}
                onChange={(e) => setTakt(Math.min(365, Math.max(0, Number(e.target.value) || 0)))} />
            </label>
            <button type="button" className={h.tlZoomB}
              disabled={!view.head || !view.head.spans[blk] || !view.kids.length}
              title={tr('Бүлгийн мужийн хоногийг доторх ажлуудад дараалан, тэнцүү хуваана')}
              onClick={spreadKids}>
              {tr('Мужид жигд хуваарилах')}
            </button>
            <button type="button" className={h.tlZoomB}
              disabled={sel == null || !lanes.some((x) => x.i === sel && x.spans[blk])}
              title={tr('Сонгосон мөрийн энэ блокийн хуваарийг арилгана')}
              onClick={clearSel}>
              {tr('Хуваарь арилгах')}
            </button>
            <button type="button" className={h.spreadBtn}
              title={tr('Энэ хуанлийн мөрүүдийн идэвхтэй блокийн хуваарийг бусад блокт алхмаар хуулна')}
              onClick={spreadBlocks}>
              {tr('Бүх блокт алхмаар тараах')}
            </button>
          </>
        )}
      </div>

      {canEdit && (
        <p className={h.plHint}>
          {tr('Хоосон мөр дээр чирж муж татна · зурвасын голоос чирж зөөнө · ирмэгээс татаж уртасгана · бүлгийн нэр дээр дарж дотогш орно')}
        </p>
      )}

      {lanes.length === 0 ? (
        <Empty label={tr('Мөр алга.')} />
      ) : (
        <div className={h.plWrap}>
          <div className={h.plSide}>
            <div className={h.plHeadPad} />
            {lanes.map((r) => (
              <button key={r.oid} type="button"
                className={`${h.plName} ${r.group ? h.plNameG : ''} ${sel === r.i ? h.plNameOn : ''}`}
                style={{ height: PL_ROW, paddingLeft: 6 + (view.head ? (r.depth - view.head.depth) * 10 : 0) }}
                title={r.work}
                onClick={() => (r.group ? onScope(r.i) : onPick(r.i))}>
                {r.group && <span className={h.plInto}>▸</span>}
                {/* ⚠️ Зарим бүлгийн «ажлын нэр» хоосон (эх хуудсанд зөвхөн
                    дугаартай) — нэрийг нь хоосон орхивол мөр таних аргагүй. */}
                <span className={h.plNo}>{r.no}</span>
                <span className={h.plWork}>{r.work || tr('(нэргүй)')}</span>
              </button>
            ))}
          </div>

          <div className={h.plScroll} ref={scrollRef}>
            <div className={h.plTrack} style={{ width: W }} ref={trackRef}>
              <div className={h.plHead}>
                {months.map((m) => (
                  <span key={m.at} className={h.plMonth} style={{ left: xOf(m.at) }}>{m.lab}</span>
                ))}
                {ticks.map((tk) => (
                  <span key={tk.at} className={`${h.plDay} ${tk.big ? h.plDayBig : ''}`}
                    style={{ left: xOf(tk.at) }}>
                    {tk.lab}
                  </span>
                ))}
              </div>

              <div className={h.plLanes}
                style={{ height: lanes.length * PL_ROW }}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              >
                {months.map((m) => (
                  <span key={m.at} className={`${h.tlGrid} ${h.tlGridBig}`} style={{ left: xOf(m.at) }} />
                ))}
                {zoom !== 'month' && ticks.filter((t2) => !t2.big).map((tk) => (
                  <span key={tk.at} className={h.tlGrid} style={{ left: xOf(tk.at) }} />
                ))}
                {now >= from && now <= to && (
                  <span className={h.tlNow} style={{ left: xOf(now) }} title={msToDay(now)} />
                )}

                {lanes.map((r, k) => {
                  const sp = r.spans[blk];
                  const st = sp ? statusOf(sp, r.act?.[blk], now) : 'none';
                  return (
                    <div key={r.oid}
                      className={`${h.plLane} ${k % 2 ? h.plLaneAlt : ''} ${sel === r.i ? h.plLaneOn : ''}`}
                      style={{ top: k * PL_ROW, height: PL_ROW }}
                      onPointerDown={(e) => onDown(e, r, 'new')}
                    >
                      {sp && (
                        <div
                          className={`${h.plBar} ${r.group ? h.plBarG : ST_CLASS[st]} ${sel === r.i ? h.tlBarOn : ''}`}
                          style={{ left: xOf(sp.start), width: Math.max(10, spanDays(sp) * px - 1) }}
                          onPointerDown={(e) => onDown(e, r, 'move')}
                          aria-label={`${r.work || r.no} · ${blocks[blk]} · ${msToDay(sp.start)} → ${msToDay(sp.end)}`}
                          title={`${r.work}\n${blocks[blk]} · ${msToDay(sp.start)} → ${msToDay(sp.end)} (${spanDays(sp)} хоног) · ${ST_TEXT[st]}`}
                        >
                          <span className={h.plGrip}
                            onPointerDown={(e) => onDown(e, r, 'l')} />
                          {spanDays(sp) * px > 96 ? (
                            <span className={h.plBarLab}>
                              {short(sp.start)}→{short(sp.end)} · {spanDays(sp)}{tr('х')}
                            </span>
                          ) : spanDays(sp) * px > 40 ? (
                            <span className={h.plBarLab}>{spanDays(sp)}{tr('х')}</span>
                          ) : null}
                          <span className={`${h.plGrip} ${h.plGripR}`}
                            onPointerDown={(e) => onDown(e, r, 'r')} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

